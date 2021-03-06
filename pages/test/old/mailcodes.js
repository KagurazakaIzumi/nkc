let mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/rescue', {useMongoClient: true});
mongoose.Promise = global.Promise;
let Schema = mongoose.Schema;

db = require('arangojs')('http://192.168.11.111');
db.useDatabase('rescue');

let mailcodesSchema = new Schema({
  email: {
    type: String,
    required: true
  },
  uid: {
    type: String,
    required: true
  },
  used: {
    type: Boolean,
    default: false
  },
  username: {
    type: String,
    required: true
  },
  token: {
    type: String,
    required: true,
    index: 1
  },
  key: {
    type: String,
    required: true,
    index: 1
  },
  toc: {
    type: Number,
    default: Date.now
  }
});

let Mailcodes = mongoose.model('mailcodes', mailcodesSchema);



let t1 = Date.now();
console.log('开始读取数据');
db.query(`
  for m in mailcodes
  return m
`)
.then(cursor => cursor.all())
.then((res) => {
  for(var i = 0; i < res.length; i++){
    res[i]._id = undefined;
    res[i].key = res[i]._key;
  }
  console.log('开始写入数据');
  let n = 0;
  let toMongo = () => {
    let data = res[n];
    let mailcodes = new Mailcodes(data);
    mailcodes.save()
    .then(() => {
      n++;
      if(n >= res.length) {
        let t2 = Date.now();
        console.log(`${res.length}条数据写入完成，耗时：${t2-t1}ms`);
        return;
      }else{
        toMongo();
        return;
      }
    })
    .catch((err) => {
      console.log(`存数据出错:${err}`)
    });
  }
  toMongo();
}) 
.catch((err) => {
  console.log(err);
})
