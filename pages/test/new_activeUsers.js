const {ActiveUserModel} = require('../../dataModels');
const db = require('./arangodb');
const begin = require('./begin');

const t = Date.now();

const init = async () => {
  let total = await db.query(`
    for u in activeusers
    collect with count into length
    return length
  `);
  total = await total.all();
  return total;
};
const moveData = async (total, begin, count) => {
  let t1 = Date.now();
  console.log(`开始读取数据（${begin} - ${begin + count}）`);
  let data = await db.query(`
    for u in activeusers
    limit ${begin}, ${count}
    return u
  `);
  data = await data.all();
  console.log('开始写入...');
  let n = 0;
  for (let d of data){
    // 处理数据=================
    n++;
    d._id = undefined;
    //=========================

    const newActiveUser = new ActiveUserModel(d);
    try {
      await newActiveUser.save();
      console.log(`总数：${total}, 第${begin+n}条数据写入成功！当前${count}条耗时：${Date.now() - t1}ms， 累计耗时：${Date.now() - t}ms`);
    }catch (e) {
      return {e, d};
    }
  }
};

begin(init, moveData);