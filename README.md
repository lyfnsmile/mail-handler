# mail-handler

### usage

```javascript
var MailHandler = require('./app.js');

var options = {
    "markSeen": true,
    "keepAttachments": true,
    "searchFilter": [ 'UNSEEN'],
    "received": {
        user: emil,
        pass: password,
        host: 'imap.qq.com',
        port: 993,
        tls: true
    },
    "send": {
        host: 'smtp.qq.com',
        port: 465,
        secure: true, // use SSL
        auth: {
            user: emil,
            pass: password
        }
    },
    "filterRuler":{
        "address":[emil1,email2],
        "keywords":[keyword1,keyword2]
    }
}

var mailHandler = new MailHandler(options);

mailHandler.receive();

```
### feedback

Email: `li.zhixiang@live.cn`