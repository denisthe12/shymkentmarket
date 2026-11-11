import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createTelegramNotifier, createTelegramSender, formatEventText, validateTelegramConfig, parseTelegramEntries } from './telegram-notifier.mjs';

// Intentionally synthetic, assembled to avoid resembling a real stored secret.
const token = '123456789:' + 'S'.repeat(35), admin = '123456789';
const config = { token, admin };
const event = { type: 'incident_opened', atUTC: 100000, id: 'a'.repeat(32), attempts: 1 };
const success = { ok: true, result: { message_id: 12, chat: { id: Number(admin), type: 'private' } } };
test('literal dotenv selects only two entries, strict duplicate/substitution rejection', () => {
  assert.deepEqual(parseTelegramEntries(['BOT_TOKEN="' + token + '"', 'ADMIN_ID=' + admin]), config);
  for (const lines of [[], ['BOT_TOKEN='+token], ['BOT_TOKEN='+token,'BOT_TOKEN='+token,'ADMIN_ID='+admin],
    ['BOT_TOKEN=$(command)','ADMIN_ID='+admin], ['BOT_TOKEN='+token,'ADMIN_ID="123\\n456"'], ['OTHER=value']]) assert.throws(()=>parseTelegramEntries(lines), /telegram_configuration/);
});
for (const patch of [{ token: '' },{ token: token+'\n' },{ token: token+'/x' },{ token: '0:'+ 'S'.repeat(35) },
  { admin: '-123' },{ admin: '0' },{ admin: '+123' },{ admin: '0123' },{ admin: admin+'\n' },{ admin: '9007199254740992' },{ admin: '1e3' }]) {
  test('strict configuration rejects '+Object.keys(patch)[0],()=>assert.throws(()=>validateTelegramConfig({...config,...patch}), /telegram_configuration/));
}
for (const kind of ['ok','no_chat','bad_chat','group','no_message','zero_message','false','nonboolean','invalid_json','utf8','partial','incomplete','length_mismatch','html','oversize','length','204','302','400','401','429','500','503','tls','throw','timeout','abort']) {
  test('fixed Telegram transport '+kind, async () => {
    let calls=0, sent, destroyed=0;
    const request=(url,options,callback)=>{
      calls++; assert.equal(url,'https://api.telegram.org/bot'+token+'/sendMessage');
      if(kind==='throw')throw Error('SECRET_URL_TOKEN');
      assert.equal(options.method,'POST');assert.equal(options.agent,false);assert.equal(options.rejectUnauthorized,true);
      assert.deepEqual(Object.keys(options.headers).sort(),['Accept','Content-Length','Content-Type']);
      const req=new EventEmitter();req.destroy=()=>{destroyed++};req.end=body=>{
        sent=JSON.parse(body);assert.deepEqual(Object.keys(sent).sort(),['chat_id','text']);assert.equal(sent.chat_id,admin);
        assert.equal(sent.text,'ALERT — Aktau Market Go API\nСервис недоступен\nUTC 1970-01-01T00:01:40Z · событие #aaaa');assert.ok(!body.includes(event.id));
        assert.equal(options.headers['Content-Length'],Buffer.byteLength(body));
        if(['timeout','abort'].includes(kind))return;
        queueMicrotask(()=>{
          if(kind==='tls'){req.emit('error',Error('SECRET_URL_TOKEN'));return;}
          const res=new EventEmitter();res.destroy=()=>{destroyed++};res.complete=true;
          res.statusCode=/^\d+$/.test(kind)?Number(kind):200;res.headers={'content-type':'application/json'};
          if(kind==='html')res.headers['content-type']='text/html';
          if(kind==='incomplete')res.complete=false;
          if(kind==='length_mismatch')res.headers['content-length']='1';
          if(kind==='length')res.headers['content-length']='999999';callback(res);
          if(kind==='partial'){res.emit('aborted');return;}
          let value=structuredClone(success);
          if(kind==='no_chat')delete value.result.chat;
          if(kind==='bad_chat')value.result.chat.id=123;
          if(kind==='group')value.result.chat.type='group';
          if(kind==='no_message')delete value.result.message_id;
          if(kind==='zero_message')value.result.message_id=0;
          if(kind==='false')value.ok=false;
          if(kind==='nonboolean')value.ok='true';
          res.emit('data',kind==='utf8'?Buffer.from([255]):kind==='oversize'?Buffer.alloc(32769):Buffer.from(kind==='invalid_json'?'{':JSON.stringify(value)));
          res.emit('end');
        });
      };return req;
    };
    const notify=createTelegramNotifier(config,{request,timeoutMs:10});
    const c=new AbortController();const p=notify(event,c.signal);if(kind==='abort')c.abort();
    assert.equal(await p,['ok','no_chat'].includes(kind));assert.equal(calls,1);if(kind!=='throw')assert.ok(destroyed>0);
  });
}
test('invalid event and pre-cancelled operation perform no request',async()=>{
  const notify=createTelegramNotifier(config,{request:()=>assert.fail('network')});
  for(const value of [{}, {...event,type:'arbitrary'}, {...event,atUTC:NaN}, {...event,id:'bad'}, {...event,attempts:0}, {...event,attempts:1.5}, {...event,attempts:undefined}])assert.equal(await notify(value),false);
  const c=new AbortController();c.abort();assert.equal(await notify(event,c.signal),false);
});
const iso='UTC 1970-01-01T00:01:40Z · событие #aaaa';
test('ALERT text with tag, seconds precision',()=>assert.equal(formatEventText(event),'ALERT — Aktau Market Go API\nСервис недоступен\n'+iso));
test('retry is marked on the first line',()=>assert.equal(formatEventText({...event,attempts:3}).split('\n')[0],'ALERT — Aktau Market Go API (повтор, попытка 3)'));
test('RECOVERED text',()=>assert.equal(formatEventText({...event,type:'incident_recovered'}),'RECOVERED — Aktau Market Go API\nРабота восстановлена\n'+iso));
test('sender rejects empty and 4097-char text without a request',async()=>{
  const send=createTelegramSender(config,{request:()=>assert.fail('network')});
  for(const t of ['','x'.repeat(4097),undefined,5])assert.equal(await send(t),false);
});
test('sender default timeout is 10000 ms and 10001 is rejected',()=>{
  assert.equal(typeof createTelegramSender(config),'function');
  assert.equal(typeof createTelegramSender(config,{timeoutMs:10000}),'function');
  for(const t of [10001,0,1.5])assert.throws(()=>createTelegramSender(config,{timeoutMs:t}),/telegram_configuration/);
  assert.throws(()=>createTelegramNotifier(config,{timeoutMs:10001}),/telegram_configuration/);
});
test('sender sends the given text as-is',async()=>{
  let sent;const request=(u,o,cb)=>{const req=new EventEmitter();req.destroy=()=>{};req.end=b=>{sent=JSON.parse(b);
    queueMicrotask(()=>{const res=new EventEmitter();res.destroy=()=>{};res.complete=true;res.statusCode=200;res.headers={'content-type':'application/json'};
      cb(res);res.emit('data',Buffer.from(JSON.stringify(success)));res.emit('end');});};return req;};
  assert.equal(await createTelegramSender(config,{request})('hello'),true);assert.deepEqual(sent,{chat_id:admin,text:'hello'});
});
