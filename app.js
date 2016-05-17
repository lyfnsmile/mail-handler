var EventEmitter = require('events').EventEmitter;
var Imap = require('imap');
var nodemailer = require('nodemailer');
var MailParser = require("mailparser").MailParser;
var fs = require("fs");
var path = require('path');
var async = require('async');
var util = require('util');


//在此基础上增加邮件过滤功能
//过滤规则有两种
//一是过滤特定发件人的邮件
//二是过滤特定邮件内容


//构造函数
function MailHandler(options) {
    //options 对象  配置参数  

    this.markSeen = !!options.markSeen;
    this.mailbox = options.mailbox || "INBOX";
    if (typeof options.searchFilter === 'string') {
        this.searchFilter = [options.searchFilter];
    } else if (util.isArray(options.searchFilter)) {
        this.searchFilter = options.searchFilter || ["UNSEEN"];
    } else {
        throw new error('参数类型错误!')
    }

    this.fetchUnreadOnStart = !!options.fetchUnreadOnStart;
    //mailParserOptiond={}
    //邮件解析配置参数
    this.mailParserOptions = options.mailParserOptions || {};
    if (options.attachments && options.attachmentOptions && options.attachmentOptions.stream) {
        this.mailParserOptions.streamAttachments = true;
    }
    this.attachmentOptions = options.attachmentOptions || {};
    this.attachments = options.attachments || false;
    this.attachmentOptions.directory = (this.attachmentOptions.directory ? this.attachmentOptions.directory : '');

    //配置收件箱参数
    this.imap = new Imap({
        xoauth2: options.received.Obj.xoauth2,
        user: options.received.username,
        password: options.received.password,
        host: options.received.host,
        port: options.received.port,
        tls: options.received.tls,
        tlsOptions: options.received.tlsOptions || {},
        connTimeout: options.received.connTimeout
    });

    this.imap.once('ready', imapReady.bind(this));
    this.imap.once('close', imapClose.bind(this));
    this.imap.on('error', imapError.bind(this));

    //配置发邮件的相关参数

    this.smtpTransport = nodemailer.createTransport({
        host: options.send.host,
        port: options.send.port,
        secure: !!options.send.secure, // use SSL
        auth: {
            user: options.send.username,
            pass: options.send.password
        }
    });
    if (options.send.filterContent) {
        this.filterContent = options.send.filterContent;
    }

};

//继承EventEmitter类
util.inherits(MailHandler, EventEmitter);

MailHandler.prototype = {
    connect: function() {
        //开始收取邮件
        this.imap.connect();
    },

    end: function() {
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
        //results 收取结果数组
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

                    msg.on('body', function(stream, info) {
                        parser.on("end", function(mail) {


                            if (mail.from) { //首先判断发件人地址
                                console.log(mail.from[0].address);
                                //发邮件代码  过滤规则、
                                if (self.filterContent) { //判断是否有设置过滤规则  按照内容
                                    //过滤规则 内容 字符串或者数组形式

                                    var mailOptions = {　　
                                        from: "46967489@qq.com",
                                        　　to: mail.from[0].address,
                                        　　subject: "node邮件",
                                        　　html: '<h2>这是一封自动回复的邮件!</h2><p style="color:#e00;">来自李志祥的邮件</p>'
                                    }

                                    if (typeof(self.filterContent) === 'string') {
                                        //默认邮件内容是html形式
                                        if (mail.html.indexOf(self.filterContent) != -1) {

                                            smtpTransport.sendMail(mailOptions, function(err, resp) {　　
                                                if (err) {　　　　
                                                    console.log(err);　
                                                }
                                                console.log("发送成功")　　
                                                smtpTransport.close(); //关闭连接池
                                            });
                                        }
                                    } else { //数组形式
                                        for (var i = 0; i < self.filterContent.length; i++) {

                                            if (mail.html.indexOf(self.filterContent[i]) != -1) {

                                                smtpTransport.sendMail(mailOptions, function(err, resp) {　　
                                                    if (err) {　　　　
                                                        console.log(err);　
                                                    }
                                                    console.log("发送成功")　　
                                                    smtpTransport.close(); //关闭连接池
                                                });
                                            }
                                        }

                                    }

                                }
                            };

                            //如果存在附件就保存到本地
                            if (mail.attachments) {
                                mail.attachments.forEach(function(attachment) {
                                    fs.writeFile('msg-' + seqno + '-' + attachment.generatedFileName, attachment.content, function(err) {
                                        if (err) {
                                            throw err;
                                        }
                                    });
                                });
                            };
                        });
                    })



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
