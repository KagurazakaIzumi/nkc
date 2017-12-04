const Router = require('koa-router');
const router = new Router();
const fs = require('fs');
const {accessSync} = fs;
const path = require('path');
const mime = require('mime');
const {promisify} = require('util');

router
  .get('/', async (ctx, next) => {
    ctx.throw(501, 'a uid is required.');
    await next()
  })
  .get('/:uid', async (ctx, next) => {
    const {uid} = ctx.params;
    try {
      const url = path.resolve(__dirname, `../../resources/pf_banners/${uid}.jpg`);
      accessSync(url);
      ctx.filePath = url;
    } catch(e) {}
    try {
      const url = path.resolve(__dirname, `../../resources/pf_banners/${uid}.jpeg`);
      accessSync(url);
      ctx.filePath = url;
    } catch(e) {}
    try {
      const url = path.resolve(__dirname, `../../resources/pf_banners/${uid}.png`);
      accessSync(url);
      ctx.filePath = url;
    } catch(e) {}
    if(!ctx.filePath)
      ctx.filePath = path.resolve(__dirname, '../../resources/default_things/default_pf_banner.jpg');
    await next()
  })
  .post('/:uid', async (ctx, next) => {
    const {uid} = ctx.params;
    const {data, db} = ctx;
    const {user} = data;
    const targetPersonalForum = await db.PersonalForumModel.findOnly({uid});
    if(user.uid !== uid && !targetPersonalForum.moderators.includes(user.uid)) ctx.throw(401, '权限不足');
    const extArr = ['jpg', 'png', 'jpeg'];
    const {imageMagick} = ctx.tools;
    const settings = ctx.settings;
    const file = ctx.body.files.file;
    if(!file) ctx.throw(400, 'no file uploaded');
    const {path, type} = file;
    const extension = mime.getExtension(type);
    if(!extArr.includes(extension)) {
      ctx.throw(400, 'wrong mimetype for avatar...jpg, jpeg or png only.')
    }
    await imageMagick.bannerify(path);
    const saveName = uid + '.' + extension;
    const {pfBannerPath} = settings.upload;
    const targetFile = pfBannerPath +'/'+ saveName;
    for(let e of extArr) {
      const path = `${pfBannerPath}/${uid}.${e}`;
      try{
        fs.unlinkSync(path);
      } catch(e){}
    }
    await promisify(fs.rename)(path, targetFile);
    await next();
});

module.exports = router;