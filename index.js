var MailHandler = require('./src/app.js');

var options = {
    "markSeen": true,
    "keepAttachments": true,
    "searchFilter": [ 'UNSEEN'],
    "received": {
        user: '46967489@qq.com',
        pass: 'ev0316.',
        host: 'imap.qq.com',
        port: 993,
        tls: true
    },
    "send": {
        host: 'smtp.qq.com',
        port: 465,
        secure: true, // use SSL
        auth: {
            user: '46967489@qq.com',
            pass: "ev0316."
        }
    },
    "filterRuler":{
         "address":['978169861@qq.com'],
        // "keywords":[keyword1,keyword2]
    }
}

var mailHandler = new MailHandler(options);

mailHandler.receive()