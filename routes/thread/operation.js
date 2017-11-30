const Router = require('koa-router');
const operationRouter = new Router();
const nkcModules = require('../../nkcModules');
const dbFn = nkcModules.dbFunction;
const tools = require('../../tools');
const {imageMagick} = tools;
operationRouter
  // 收藏帖子
  .post('/addColl', async (ctx, next) => {
    const {tid} = ctx.params;
    const {db, data} = ctx;
    const {user} = data;
    const thread = await db.ThreadModel.findOnly({tid});
    if(thread.disabled) ctx.throw(401, '不能收藏已被封禁的帖子');
    if(!await thread.ensurePermission(ctx)) ctx.throw(401, '权限不足');
    const collection = await db.CollectionModel.findOne({tid: tid, uid: user.uid});
    if(collection) ctx.throw(400, '该贴子已经存在于您的收藏中，没有必要重复收藏');
    const newCollection = new db.CollectionModel({
      cid: await db.SettingModel.operateSystemID('collections', 1),
      tid: tid,
      uid: user.uid
    });
    try{
      await newCollection.save();
    } catch (err) {
      await db.SettingModel.operateSystemID('collections', -1);
      ctx.throw(500, `收藏失败: ${err}`);
    }
    data.targetUser = await thread.getUser();
    await next();
  })
  // 首页置顶
  .patch('/ad', async (ctx, next) => {
    const {tid} = ctx.params;
    const {db, data} = ctx;
    const thread = await db.ThreadModel.findOnly({tid});
    if(data.userLevel < 6) ctx.throw(401, '权限不足');
    if(thread.disabled) ctx.throw(404, '该贴子已被屏蔽，请先解除屏蔽再执行置顶操作');
    const setting = await db.SettingModel.findOnly({uid: 'system'});
    const ads = setting.ads;
    const index = ads.findIndex((elem, i, arr) => elem === tid);
    const targetUser = await thread.getUser();
    if(index > -1) {
      ads.splice(index, 1);
      await imageMagick.removeFile(`./resources/ad_posts/${tid}.jpg`);
    } else {
      if(ads.length === 6) {
        ads.shift();
      }
      ads.push(tid);
      const oc = await db.PostModel.findOnly({pid: thread.oc});
      let resourceArr = oc.r || [];
      let resource = (await db.ResourceModel.aggregate([
        {$match:{rid: {$in: resourceArr}}},
        {$match: {ext: {$in: ['jpg', 'png', 'svg', 'jpeg']}}},
      ]))[0];
      if(resource) {
        const name = `./resources/ad_posts/${tid}.jpg`;
        const path = `./resources/upload${resource.path}`;
        await imageMagick.generateAdPost(path, name);
      } else {
        const path = `./resources/newavatar/${targetUser.uid}.jpg`;
        const name = `./resources/ad_posts/${tid}.jpg`;
        await imageMagick.generateAdPost(path, name);
      }
    }
    await setting.update({ads});
    await next();
  })
  // 精华
  .patch('/digest', async (ctx, next) => {
    const {tid} = ctx.params;
    const {digest} = ctx.body;
    const {db, data} = ctx;
    const {user} = data;
    if(digest === undefined) ctx.throw(400, '参数不正确');
    const thread = await db.ThreadModel.findOnly({tid});
    if(!await thread.ensurePermissionOfModerators(ctx)) ctx.throw(401, '权限不足');
    if(thread.disabled) ctx.throw(400, '该贴子已被屏蔽，请先解除屏蔽再执行置顶操作');
    const obj = {digest: false};
    let number = -1;
    if(digest) {
      obj.digest = true;
      number = 1;
    }
    await thread.update(obj);
    if(thread.digest === digest) {
      if(!digest) ctx.throw(400, '该贴子在您操作前已经被撤销精华了，请刷新');
      if(digest) ctx.throw(400, '该贴子在您操作前已经被设置成精华了，请刷新');
    }
    data.targetUser = await thread.getUser;
    const targetForum = await db.ForumModel.findOnly({fid: thread.fid});
    await targetForum.setCountOfDigestThread(number);
    await next();
  })
  .patch('/topped', async (ctx, next) => {
    const {tid} = ctx.params;
    const {db, data} = ctx;
    const {topped} = ctx.body;
    const {user} = data;
    if(topped === undefined) ctx.throw(400, '参数不正确');
    const thread = await db.ThreadModel.findOnly({tid});
    if(!await thread.ensurePermissionOfModerators(ctx)) ctx.throw(401, '权限不足');
    if(thread.disabled) ctx.throw(400, '该贴子已被屏蔽，请先解除屏蔽再执行置顶操作');
    const obj = {topped: false};
    if(topped) obj.topped = true;
    await thread.update(obj);
    if(thread.topped === topped) {
      if(topped) ctx.throw(400, '该帖子在您操作前已经被置顶了，请刷新');
      if(!topped) ctx.throw(400, '该帖子在您操作前已经被取消置顶了，请刷新');
    }
    data.targetUser = await thread.getUser();
    await next();
  })
  .patch('/moveThread', async (ctx, next) => {
    const {data, db} = ctx;
    const {user} = data;
    const {tid} = ctx.params;
    let {fid, cid} = ctx.body;
    if(fid === undefined) ctx.throw(400, '参数不正确');
    if(cid === undefined) cid = 0;
    const targetForum = await db.ForumModel.findOne({fid});
    const targetCategory = await db.ThreadTypeModel.findOne({cid});
    if(!targetCategory) cid = 0;
    if(!targetForum || (targetCategory && targetForum.fid !== targetCategory.fid)) ctx.throw(400, '参数不正确');
    const targetThread = await db.ThreadModel.findOnly({tid});
    data.targetUser = await targetThread.extendUser();
    const oldForum = await targetThread.extendForum();
    const oldCid = targetThread.cid;
    // 版主只能改变帖子的分类，不能移动帖子到其他板块
    if(data.userLevel <= 4 && (fid === 'recycle' || (!oldForum.moderators.includes(user.uid) || fid !== oldForum.fid))) ctx.throw(401, '权限不足');
    const tCount = {
      digest: 0,
      normal: 0
    };
    if(targetThread.digest) {
      tCount.digest = 1;
    } else {
      tCount.normal = 1;
    }
    let status = 0;
    try {
      await targetThread.update({
        cid,
        fid
      });
      status++;
      await db.PostModel.updateMany({tid}, {$set: {fid}});
      status++;
      await oldForum.update({$inc: {'tCount.digest': -1*tCount.digest, 'tCount.normal': -1*tCount.normal}});
      status++;
      await targetForum.update({$inc: {'tCount.digest': tCount.digest, 'tCount.normal': tCount.normal}});
    } catch (err) {
      if(status >= 0) {
        await targetThread.update({cid: oldCid, fid: oldForum.fid});
      }
      if(status >= 1) {
        await db.PostModel.updateMany({tid}, {$set: {fid: oldForum.fid}});
      }
      if(status >= 2) {
        await oldForum.update({$inc: {'tCount.digest': tCount.digest, 'tCount.normal': tCount.normal}});
      }
      if(status === 3) {
        await targetForum.update({$inc: {'tCount.digest': -1*tCount.digest, 'tCount.normal': -1*tCount.normal}});
      }
      ctx.throw(500, `移动帖子失败： ${err}`);
    }
    await next();
  })
  .post('/recycleThread', async (ctx, next) => {
    const tid = ctx.params.tid;
    ctx.data = `移动帖子到回收站   tid：${tid}`;
    await next();
  })
  .post('/moveToPersonalForum', async (ctx, next) => {
    const tid = ctx.params.tid;
    ctx.data = `移动帖子到个人版   tid：${tid}`;
    await next();
  })
  .post('/switchVInPersonalForum', async (ctx, next) => {
    const tid = ctx.params.tid;
    ctx.data = `在专栏显示隐藏   tid：${tid}`;
    await next();
  })
  .post('/switchDInPersonalForum', async (ctx, next) => {
    const tid = ctx.params.tid;
    ctx.data = `在专栏加精   tid：${tid}`;
    await next();
  })
  .post('/switchTInPersonalForum', async (ctx, next) => {
    const tid = ctx.params.tid;
    ctx.data = `在专栏顶置   tid：${tid}`;
    await next();
  });

module.exports = operationRouter;