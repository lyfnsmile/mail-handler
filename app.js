var EventEmitter = require('events').EventEmitter;
var Imap = require('imap');
var MailParser = require("mailparser").MailParser;
var fs = require("fs");
var path = require('path');
var async = require('async');
var util = require('util');

//在此基础上增加邮件过滤功能


//构造函数
function MailHandler(options) {
    //options 对象  配置参数
    this.markSeen = !!options.markSeen;
    this.mailbox = options.mailbox || "INBOX";
    if (typeof options.searchFilter === 'string') {
        this.searchFilter = [options.searchFilter];
    } else {
        this.searchFilter = options.searchFilter || ["UNSEEN"];
    }
    this.fetchUnreadOnStart = !!options.fetchUnreadOnStart;
    this.mailParserOptions = options.mailParserOptions || {};
    if (options.attachments && options.attachmentOptions && options.attachmentOptions.stream) {
        this.mailParserOptions.streamAttachments = true;
    }
    this.attachmentOptions = options.attachmentOptions || {};
    this.attachments = options.attachments || false;
    this.attachmentOptions.directory = (this.attachmentOptions.directory ? this.attachmentOptions.directory : '');
    
    //配置收件箱参数
    this.imap = new Imap({
        xoauth2: options.xoauth2,
        user: options.username,
        password: options.password,
        host: options.host,
        port: options.port,
        tls: options.tls,
        tlsOptions: options.tlsOptions || {},
        connTimeout: options.connTimeout
    });

    this.imap.once('ready', imapReady.bind(this));
    this.imap.once('close', imapClose.bind(this));
    this.imap.on('error', imapError.bind(this));
};

//继承EventEmitter类
util.inherits(MailHandler, EventEmitter);

MailHandler.prototype = {
    receive: function() {
        //开始收取邮件
        this.imap.connect();
    },

    stop: function() {
        //终止

        this.imap.end();
    }
};


function imapReady() {
    var self = this;
    this.imap.openBox(this.mailbox, false, function(err, mailbox) {
        if (err) {
            self.emit('error', err);
        } else {
            self.emit('server:connected');
            if (self.fetchUnreadOnStart) {
                parseUnread.call(self);
            }
            self.imap.on('mail', imapMail.bind(self));
        }
    });
}

function imapClose() {
    this.emit('server:disconnected');
}

function imapError(err) {
    this.emit('error', err);
}

function imapMail() {
    parseUnread.call(this);
}

function parseUnread() {
    var self = this;
    this.imap.search(self.searchFilter, function(err, results) {
        if (err) {
            self.emit('error', err);
        } else if (results.length > 0) {
            //异步并发的收取邮件内容
            async.each(results, function(result, callback) {
                var f = self.imap.fetch(result, {
                    bodies: '',
                    markSeen: self.markSeen
                });
                f.on('message', function(msg, seqno) {
                    //开始解析邮件内容
                    var parser = new MailParser(self.mailParserOptions);
                    var attributes = null;

                    parser.on("end", function(mail) {
                        if (!self.mailParserOptions.streamAttachments && mail.attachments && self.attachments) {
                            async.each(mail.attachments, function(attachment, callback) {
                                fs.writeFile(self.attachmentOptions.directory + attachment.generatedFileName, attachment.content, function(err) {
                                    if (err) {
                                        self.emit('error', err);
                                        callback()
                                    } else {
                                        attachment.path = path.resolve(self.attachmentOptions.directory + attachment.generatedFileName);
                                        self.emit('attachment', attachment);
                                        callback()
                                    }
                                });
                            }, function(err) {
                                self.emit('mail', mail, seqno, attributes);
                                callback()
                            });
                        } else {
                            self.emit('mail', mail, seqno, attributes);
                        }
                    });
                    parser.on("attachment", function(attachment) {
                        self.emit('attachment', attachment);
                    });
                    msg.on('body', function(stream, info) {
                        stream.pipe(parser);
                    });
                    msg.on('attributes', function(attrs) {
                        attributes = attrs;
                    });
                });
                f.once('error', function(err) {
                    self.emit('error', err);
                });
            }, function(err) {
                if (err) {
                    self.emit('error', err);
                }
            });
        }
    });
}


module.exports = MailHandler;
