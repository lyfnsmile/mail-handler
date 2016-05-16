var EventEmitter = require('events').EventEmitter;
var Imap = require('imap');
var MailParser = require("mailparser").MailParser;
var fs = require("fs");
var path = require('path');
var async = require('async');
var util = require('util');

function mailHandler(options) {
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
    this.imap = new Imap({
        xoauth2: options.xoauth2,
        user: options.username,
        password: options.password,
        host: options.host,
        port: options.port,
        tls: options.tls,
        tlsOptions: options.tlsOptions || {}
    });

    this.imap.once('ready', imapReady.bind(this));
    this.imap.once('close', imapClose.bind(this));
    this.imap.on('error', imapError.bind(this));
}
