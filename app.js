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

    this.filterRuler = options.filterRuler || null;

    this.keepAttachments = options.keepAttachments;

    //邮件解析配置参数
    this.mailParserOptions = options.mailParserOptions || {};
    if (options.attachments && options.attachmentOptions && options.attachmentOptions.stream) {
        this.mailParserOptions.streamAttachments = true;
    }
    this.attachmentOptions = options.attachmentOptions || {};
    this.attachments = options.attachments || false;
    this.attachmentOptions.directory = (this.attachmentOptions.directory ? this.attachmentOptions.directory : __dirname + '/attachments');

    //配置收件箱参数
    this.imap = new Imap({
        user: options.received.user,
        password: options.received.pass,
        host: options.received.host,
        port: options.received.port,
        tls: options.received.tls,
        tlsOptions: options.received.tlsOptions || {},
        connTimeout: options.received.connTimeout || 1000
    });

    this.imap.once('ready', imapReady.bind(this));


    //配置发邮件的相关参数
    this.sendOptions = {
        host: options.send.host,
        port: options.send.port,
        secure: true, // use SSL
        auth: {
            user: options.send.auth.user,
            pass: options.send.auth.pass
        }
    }
};

//继承EventEmitter类
util.inherits(MailHandler, EventEmitter);

MailHandler.prototype = {
    receive: function() {
        //开始收取邮件       
        this.imap.connect();
        console.log('开始读取邮件...');
    },

    stop: function() {
        //终止
        this.imap.end();
        console.log('结束读取邮件...');
    }
};

function imapReady() {
    var self = this;

    this.imap.openBox(this.mailbox, false, function(err, box) {
        if (err) {
            throw err;
        }

        imapMail.call(self)
    })

}

function imapMail() {
    parseUnread.call(this);
}

//解析未读邮件
function parseUnread() {
    var self = this;
    this.imap.search(self.searchFilter, function(err, results) {
        //存放拦截邮件的地址
        var mailIntercept = [];

        var len = results.length;
        var flag = 0;

        if (err) {
            throw err
        }
        //异步并发的收取邮件内容
        async.each(results, function(result, callback) {
            var f = self.imap.fetch(result, {
                bodies: '',
                markSeen: self.markSeen
            });
            f.on('message', function(msg, seqno) {
                //开始解析邮件内容
                var parser = new MailParser();

                parser.on("end", function(mail) {

                    //保存邮件正文
                    fs.exists("content", function(exists) {
                        if (exists) {
                            fs.writeFile(__dirname + '/content/' + 'msg- ' + seqno + '.html', mail.html, function(err) {
                                if (err) {
                                    throw err;
                                }
                            });
                        } else {
                            fs.mkdir("content", function() {
                                fs.writeFile(__dirname + '/content/' + 'msg- ' + seqno + '.html', mail.html, function(err) {
                                    if (err) {
                                        throw err;
                                    }
                                });
                            })
                        }
                    })

                    //保存附件
                    if (mail.from) { //首先判断发件人地址
                        //发邮件代码  过滤规则
                        if (self.filterRuler) { //判断是否有设置过滤规则  按照内容
                            //过滤规则 内容 字符串或者数组形式

                            //过滤收件人
                            if (self.filterRuler.address && self.filterRuler.address.length != 0) {
                                var index = self.filterRuler.address.indexOf(mail.from[0].address);
                                if (index != -1) {

                                    if (mailIntercept.indexOf(mail.from[0].address == -1)) {
                                        mailIntercept.push(mail.from[0].address)
                                    }
                                }
                            }

                            //依据关键字过滤邮件内容
                            //只要含有关键字之一就拦截
                            if (self.filterRuler.keywords && self.filterRuler.keywords.length != 0) {
                                //含有关键字之一只发一封邮件
                                for (var i = 0; i < self.filterRuler.keywords.length; i++) {
                                    //console.log(mail)
                                    //根据邮件text而非html来筛选关键字
                                    mail['content'] = mail.text || mail.html
                                    if (mail.content.indexOf(self.filterRuler.keywords[i]) != -1) {

                                        if (mailIntercept.indexOf(mail.from[0].address == -1)) {
                                            mailIntercept.push(mail.from[0].address)
                                        }
                                    }
                                }

                            }

                        }
                    } else {
                        console.log("获取不到发件人地址，无法给该封邮件自动回复!")
                    }

                    //如果存在附件就保存到本地
                    if (self.keepAttachments && mail.attachments) {

                        //检查目录是否存在
                        //存在就不创建
                        //不存在就异步创建一个文件夹
                        fs.exists("attachments", function(exists) {
                            if (exists) {
                                //mail.attachments为一个数组对象，一封邮件存在多个附件
                                mail.attachments.forEach(function(attachment) {
                                    fs.writeFile(__dirname + '/attachments/' + 'msg-' + seqno + '-' + attachment.generatedFileName, attachment.content, function(err) {
                                        if (err) {
                                            throw err;
                                        }
                                    });
                                });
                            } else {
                                fs.mkdir("attachments", function() {
                                    mail.attachments.forEach(function(attachment) {
                                        fs.writeFile(__dirname + '/attachments/' + 'msg-' + seqno + '-' + attachment.generatedFileName, attachment.content, function(err) {
                                            if (err) {
                                                throw err;
                                            }
                                        });
                                    });
                                })
                            }
                        })


                    };
                });


                msg.on('body', function(stream, info) {
                    //已经走到现在这一步了
                    //console.log(info)
                    stream.pipe(parser);

                });
                msg.on('end', function() {
                    flag++;
                    if (flag === len) {
                        console.log(flag + "封邮件全部读取完成...")
                            //去除重复的邮件地址
                        var mailAddress = [];
                        if (mailIntercept.length > 0) {
                            for (var k = 0; k < mailIntercept.length; k++) {
                                if (mailAddress.indexOf(mailIntercept[k]) == -1) {
                                    mailAddress.push(mailIntercept[k]);
                                }
                            }
                        };
                        
                        var mailAddressList = mailAddress.join(",");
                        //群发邮件
                        var smtpTransport = nodemailer.createTransport(self.sendOptions);

                        var mailOptions = {
                            from: self.sendOptions.auth.user,
                            to: mailAddressList, // list of receivers
                            subject: 'Hello ✔',
                            html: '<b>Hello world 🐴</b>'
                        };

                        smtpTransport.sendMail(mailOptions, function(error, info) {
                            if (error) {
                                return console.log(error);
                            }
                            console.log('Message sent: ' + info.response);
                        });
                    }
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

    });
}


module.exports = MailHandler;



//关于邮件过滤的思路
//先把过滤邮件的地址存在一个数组里面
//等到所有的邮件都收取完成后再群发邮件
