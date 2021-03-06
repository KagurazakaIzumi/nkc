const Router = require('koa-router');
const nkcModules = require('../../nkcModules');
const settings = require('../../settings');
const dbFn = nkcModules.dbFunction;
const apiFn = nkcModules.apiFunction;
const forgotPasswordRouter = new Router();
forgotPasswordRouter
  // 手机找回密码页面
.get(['/mobile', '/'], async (ctx, next) => {
  const {data} = ctx;
  const {mobile, mcode} = ctx.query;
  data.mobile = mobile;
  data.mcode = mcode;
  ctx.template = 'interface_viewForgotPassword2.pug';
  await next();
})
.post('/mobile', async (ctx, next) => {
  const {db, data} = ctx;
  const {username, mcode, mobile} = ctx.body;
  if(!username) ctx.throw(400, '用户名不能为空！');
  if(!mobile) ctx.throw(400, '电话号码不能为空！');
  if(!mcode) ctx.throw(400, '手机验证码不能为空！');
  const user = await db.UserModel.findOne({usernameLowerCase: username.toLowerCase()});
  if(!user) ctx.throw(400, `用户名不存在，请重新输入`);
  const userPersonal = await db.UsersPersonalModel.findOne({uid: user.uid});
  if(!userPersonal.mobile) ctx.throw(400, '账号未绑定手机号，请通过其他方式找回密码');
  const newMobile = '0086' + mobile; // 使用国际区号后， 0086 换成客户端发送的区号
  if(newMobile !== userPersonal.mobile && mobile !== userPersonal.mobile) ctx.throw(400, '账号与手机号无法对应，请重新输入');
  const smsCode = await dbFn.checkMobileCode(newMobile, mcode);
  if(!smsCode) ctx.throw(400, '手机验证码错误或过期，请检查');
  data.mobile = mobile;
  data.mcode = mcode;
  await next();
})
.put('/mobile', async (ctx, next) => {
  const {db} = ctx;
  const {password, mcode, mobile} = ctx.body;
  if(!password) ctx.throw(400, '密码不能为空！');
  if(password.length <= 8) ctx.throw(400, '密码长度至少要大于8位');
  if(!apiFn.checkPass(password)) ctx.throw(400, '密码要具有数字、字母和符号三者中的至少两者！');
  if(!mobile) ctx.throw(400, '电话号码不能为空！');
  if(!mcode) ctx.throw(400, '手机验证码不能为空！');
  const newMobile = '0086' + mobile;
  const smsCode = await dbFn.checkMobileCode(newMobile, mcode);
  if(!smsCode) ctx.throw(400, '手机验证码错误或过期，请检查');
  await smsCode.update({used: true});
  const passwordAndType = apiFn.newPasswordObject(password);
  await db.UsersPersonalModel.replaceOne({$or: [{mobile: newMobile}, {mobile: mobile}]}, {$set: {password: passwordAndType.password, hashType: passwordAndType.hashType}});
  await next();
})
.get('/email', async (ctx, next) => {
  const {data} = ctx;
  const {sent, email, token} = ctx.query;
  data.sent = sent;
  data.token = token;
  data.email = email;
  data.token = token;
  ctx.template = 'interface_viewForgotPassword.pug';
  await next();
})
.post('/email', async (ctx, next) => {
  const {data, db} = ctx;
  const {username, email} = ctx.body;
  if(!username) ctx.throw(400, '用户名不能为空！');
  if(!email) ctx.throw(400, '邮箱地址不能为空！');
  const user = await db.UserModel.findOne({usernameLowerCase: username.toLowerCase()});
  if(!user) ctx.throw(400, '用户名不存在，请重新输入');
  const userPersonal = await db.UsersPersonalModel.findOne({uid: user.uid});
  if(!userPersonal.email) ctx.throw(400, '账号未绑定邮箱，请通过其他方式找回密码');
  if(email !== userPersonal.email) ctx.throw(400, '账号与邮箱地址无法对应，请重新输入');
  const emailCountOfDB = await dbFn.checkNumberOfSendEmailReset(email);
  if(emailCountOfDB >= settings.sendMessage.sendEmailCount) ctx.throw('404', '邮件发送次数已达上限，请隔天再试');
  const token = Math.floor((Math.random()*(65536*65536))).toString(16);
  const emailCode = new db.EmailCodeModel({
    email: email,
    token: token,
    uid: user.uid
  });
  await emailCode.save();
  const text = `有人在 ${(new Date).toLocaleString()} 请求重置账户密码。如果这不是你的操作，请忽略。 `;
  const href = `http://bbs.kechuang.org/forgotPassword/email?email=${email}&token=${token}`;
  const link = `<a href="${href}">${href}</a>`;
  await nkcModules.sendEmail({
    from: settings.mailSecrets.exampleMailOptions.from,
    to: email,
    subject: '请求重置密码',
    text: text + href,
    html: text + link,
  });
  data.message = '邮件发送成功，请查收';
  await next();
})
.put('/email', async (ctx, next) => {
  const {db} = ctx;
  const {email, password, password2, token} = ctx.body;
  if(password !== password2) ctx.throw(400, '两次输入的密码不一致，请重新输入');
  if(!email) ctx.throw(400, '邮箱地址不能为空！');
  if(!token) ctx.throw(400, 'token不能为空！');
  if(!password) ctx.throw(400, '新密码不能为空！');
  if(password.length <= 8) ctx.throw(400, '密码长度至少要大于8位');
  if(!apiFn.checkPass(password)) ctx.throw(400, '密码要具有数字、字母和符号三者中的至少两者！');
  const time = Date.now() - settings.sendMessage.emailCodeTime;
  const emailCode = await db.EmailCodeModel.findOne({used: false, email: email, token: token, toc: {$gt: time}});
  if(!emailCode) ctx.throw(400, '邮件已失效，请尝试重新发送邮件');
  const passwordAndType = apiFn.newPasswordObject(password);
  await db.UsersPersonalModel.replaceOne({email: email}, {$set: {password: passwordAndType.password, hashType: passwordAndType.hashType}});
  await db.EmailCodeModel.replaceOne({used: false, email: email, token: token}, {$set: {used: true}});
  await next();
});
module.exports = forgotPasswordRouter;