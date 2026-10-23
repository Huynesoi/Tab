cat > bot.js << 'EOF'
const {exec,execFile}=require('child_process')
const fs=require('fs')
const os=require('os')
const crypto=require('crypto')
const T=process.env.TOKEN||'8854036998:AAFi_o7k4v_7eMTQlH5Y7vy-yVIiVURasBc'
const O=String(process.env.OWNER||'6851573199')
const A=`https://api.telegram.org/bot${T}/`
const PF=__dirname+'/proxy.txt'
const MAXTXT=12000
const HELP='/addsocks5 ip:port:user:pass\n/delproxy\n/proxy\n/ip\n/test\n/get url\n/raw url\n/head url\n/dl url\n/sh lệnh\n/wifi'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const LO='abcdefghijklmnopqrstuvwxyz',UP='ABCDEFGHIJKLMNOPQRSTUVWXYZ',DG='0123456789',SP='!@#$%&*?'
const rc=s=>s[crypto.randomInt(s.length)]
const shuf=a=>{for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
const mk=(len,need,pool)=>{const a=need.map(rc);while(a.length<len)a.push(rc(pool));return shuf(a).join('')}
const rUser=()=>{
let u=mk(crypto.randomInt(8,13),[UP,LO],LO+UP+DG)
if(/\d/.test(u[0]))u=rc(LO+UP)+u.slice(1)
return u
}
const rPass=()=>mk(crypto.randomInt(12,17),[UP,LO,DG,SP],LO+UP+DG+SP)
const api=(m,b)=>fetch(A+m,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json())
const say=async(c,t)=>{t=String(t||'(trống)');for(let i=0;i<t.length;i+=4000)await api('sendMessage',{chat_id:c,text:t.slice(i,i+4000)})}
const sendFile=async(c,buf,name)=>{
if(buf.length>48e6)throw new Error('File lớn hơn 48MB, Telegram không cho gửi')
const fm=new FormData()
fm.append('chat_id',c)
fm.append('document',new Blob([buf]),name)
const r=await(await fetch(A+'sendDocument',{method:'POST',body:fm})).json()
if(!r.ok)throw new Error(r.description)
}
const run=c=>new Promise(r=>exec(c,{timeout:30000,maxBuffer:1e7},(e,o,s)=>r((o+s)||(e&&e.message)||'')))
const txt=h=>h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ').trim()
const UA=['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36','Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36']
const px=()=>fs.existsSync(PF)?fs.readFileSync(PF,'utf8').trim():''
const chk=u=>{if(!/^https?:\/\//i.test(u))throw new Error('URL phải bắt đầu bằng http:// hoặc https://');return u}
const cu=(u,x=[])=>new Promise((ok,no)=>{
const p=px()
if(!p)return no(new Error('Chưa có proxy. Dùng /addsocks5 ip:port:user:pass'))
const a=['-q','-sS','-L','--proto','=http,https','--proto-redir','=http,https','--max-time','40','--max-redirs','5','--compressed','--no-keepalive','-x',p,'-A',UA[Math.floor(Math.random()*UA.length)],'-H','Accept-Language: en-US,en;q=0.9',...x,u]
execFile('curl',a,{maxBuffer:3e7,encoding:'utf8'},(e,o,s)=>e?no(new Error((s||e.message).trim())):ok(o))
})
const cmd={
start:()=>HELP,
help:()=>HELP,
addsocks5:async(a,c,m)=>{
api('deleteMessage',{chat_id:c,message_id:m}).catch(()=>{})
const [h,p,u,...r]=a.split(':')
const w=r.join(':')
if(!h||!/^\d+$/.test(p||''))return 'Sai cú pháp. Dùng: /addsocks5 ip:port:user:pass'
const s='socks5h://'+(u?encodeURIComponent(u)+(w?':'+encodeURIComponent(w):'')+'@':'')+h+':'+p
const old=px()
fs.writeFileSync(PF,s,{mode:0o600})
try{return 'Proxy hoạt động. IP hiện tại: '+(await cu('https://api.ipify.org')).trim()}
catch(e){old?fs.writeFileSync(PF,old,{mode:0o600}):fs.rmSync(PF,{force:true});return 'Proxy lỗi, đã hủy: '+e.message}
},
delproxy:()=>{if(!px())return 'Không có proxy nào.';fs.rmSync(PF,{force:true});return 'Đã xóa proxy. Bot sẽ không vào web cho đến khi thêm proxy mới.'},
proxy:()=>px()?'Đang dùng: '+px().replace(/\/\/.*@/,'//***@'):'Chưa có proxy',
ip:async()=>(await cu('https://api.ipify.org')).trim(),
test:async(a,c)=>{
if(!px())return 'Chưa bật proxy. Dùng /addsocks5 ip:port:user:pass trước.'
let pip
try{pip=(await cu('https://api.ipify.org')).trim()}catch(e){return 'Proxy lỗi, không kết nối được: '+e.message}
let dip=''
try{dip=(await(await fetch('https://api.ipify.org',{signal:AbortSignal.timeout(10000)})).text()).trim()}catch(e){}
if(dip&&dip===pip)return 'Proxy chưa che được IP: IP qua proxy trùng IP thật ('+pip+'). Dừng test.'
await say(c,'Proxy OK. IP proxy: '+pip+(dip?'\nIP thật: '+dip:'')+'\nĐang vào emailnator.com...')
const id=Date.now()
const j1=os.tmpdir()+'/ck1_'+id
const j2=os.tmpdir()+'/ck2_'+id
const b1=['-c',j1,'-b',j1,'-A',UA[0]]
const b2=['-c',j2,'-b',j2,'-A',UA[1]]
const H2=['-H','accept: application/json','-H','content-type: application/json; charset=utf-8','-H','Origin: https://cloudphone.bestmoon.vn','-H','Referer: https://cloudphone.bestmoon.vn/']
const xs=()=>{try{const l=fs.readFileSync(j1,'utf8').split('\n').find(x=>x.includes('\tXSRF-TOKEN\t'));return l?decodeURIComponent(l.split('\t').pop().trim()):''}catch(e){return ''}}
const E=()=>{const t=xs();return ['-H','Accept: application/json','-H','Origin: https://www.emailnator.com','-H','Referer: https://www.emailnator.com/',...(t?['-H','X-XSRF-TOKEN: '+t]:[])]}
const gen=async()=>{
let err=''
for(let n=1;n<=15;n++){
try{
const r=await cu('https://www.emailnator.com/api/generate-email',[...b1,...E(),'-H','Content-Type: application/json','-d','{"ids":[1,2,3,8]}'])
const j=JSON.parse(r)
if(j&&j.status==='success'&&/@gmail\.com$/i.test(j.email||''))return {em:j.email}
err='Phản hồi: '+r.slice(0,200)
}catch(e){err=e.message}
await sleep(400)
}
return {err}
}
const inbox=e=>'https://www.emailnator.com/inbox#'+encodeURIComponent(e)
const readOtp=async em=>{
let err=''
for(let n=1;n<=30;n++){
try{
const r=await cu('https://www.emailnator.com/api/message-list',[...b1,...E(),'-H','Content-Type: application/json','-d',JSON.stringify({email:em,limit:20})])
const d=JSON.parse(r)
const ms=(d&&d.status==='success'&&Array.isArray(d.messages)?d.messages:[]).filter(m=>m.from&&String(m.from).includes('phonecloud.customer@gmail.com')).sort((x,y)=>(Number(y.timestamp)||0)-(Number(x.timestamp)||0))
for(const m of ms){
const mid=m.id||m.messageID
if(!mid)continue
const dj=JSON.parse(await cu('https://www.emailnator.com/api/message/'+encodeURIComponent(mid),[...b1,...E()]))
const clean=txt(String(dj.content||''))
const mt=clean.match(/Mã\s+OTP\s+xác\s+thực\s+email\s*([A-Z0-9]{6})/i)
let otp=mt&&mt[1]
if(!otp){const w=clean.match(/\b[A-Z0-9]{6}\b/g)||[];otp=w.find(x=>/\d/.test(x))||w[0]}
if(otp)return {otp,subject:m.subject||''}
}
err=ms.length?'Có '+ms.length+' thư từ PhoneCloud nhưng chưa đọc được mã OTP':'Chưa có thư nào từ PhoneCloud'
}catch(e){err=e.message}
await sleep(2000)
}
return {err}
}
const io=async(us,pw,acc)=>{
let ic
try{ic=(await cu('https://bestmoon.io/',[...b2,'-o','/dev/null','-w','%{http_code}'])).trim()}
catch(e){return 'Không vào được bestmoon.io: '+e.message+'\n\n'+acc}
let r
try{r=await cu('https://cloud-api.bestmoon.vn/authen/login',[...b2,'-H','Content-Type: application/json','-H','Accept: application/json','-H','Origin: https://bestmoon.io','-H','Referer: https://bestmoon.io/','-d',JSON.stringify({userName:us,password:pw})])}
catch(e){return 'bestmoon.io: HTTP '+ic+'\nLỗi kết nối khi đăng nhập lại: '+e.message+'\n\n'+acc}
let j=null
try{j=JSON.parse(r)}catch(e){}
if(!(j&&j.success&&j.data))return 'bestmoon.io: HTTP '+ic+'\nĐăng nhập lại thất bại: '+String((j&&j.message)||r.slice(0,300))+'\n\n'+acc
const d=j.data
const sn=[['pc_jwt',d.accessToken],['pc_refresh',d.refreshToken],['pc_uid',d.userId],['pc_user',d.userName]].map(([k,v])=>'localStorage.setItem('+JSON.stringify(k)+','+JSON.stringify(String(v==null?'':v))+')').join(';')+';location.reload()'
return 'bestmoon.io: HTTP '+ic+'\nĐĂNG NHẬP LẠI THÀNH CÔNG!\nUserId: '+d.userId+'\nUserName: '+d.userName+'\n\n'+acc+'\n\nĐể vào lại acc trên trình duyệt: mở https://bestmoon.io, mở Console rồi dán đoạn sau:\n\n'+sn
}
const login=async(us,pw,em)=>{
const acc='Username: '+us+'\nPassword: '+pw+'\nEmail: '+em+'\nInbox: '+inbox(em)
let r
try{r=await cu('https://cloud-api.bestmoon.vn/authen/login',[...b2,...H2,'-d',JSON.stringify({userName:us,password:pw})])}
catch(e){return 'Lỗi kết nối khi đăng nhập: '+e.message}
let j
try{j=JSON.parse(r)}catch(e){return 'Phản hồi đăng nhập không phải JSON: '+r.slice(0,300)}
if(!(j&&j.success&&j.data))return 'Đăng nhập thất bại: '+String((j&&j.message)||r.slice(0,300))
const d=j.data
const tok=String(d.accessToken||'')
const ck=[['AccessToken',d.accessToken],['RefreshToken',d.refreshToken],['UserId',d.userId],['UserName',d.userName]]
fs.appendFileSync(j2,'\n'+ck.map(([k,v])=>'cloudphone.bestmoon.vn\tFALSE\t/\tTRUE\t0\t'+k+'\t'+String(v==null?'':v)).join('\n')+'\n')
const out=['ĐĂNG NHẬP THÀNH CÔNG!','UserId: '+d.userId,'UserName: '+d.userName,'AccessToken: '+tok.slice(0,20)+'...']
try{
const o=await cu('https://cloudphone.bestmoon.vn/customer/dashboard',[...b2,'-w','\n%{http_code} %{url_effective}'])
const i=o.lastIndexOf('\n')
const [hc,...fu]=o.slice(i+1).split(' ')
const tt=(o.slice(0,i).match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]
out.push('Dashboard: HTTP '+hc,'URL cuối: '+fu.join(' '))
if(tt)out.push('Tiêu đề: '+tt.trim())
}catch(e){out.push('Không vào được Dashboard: '+e.message)}
if(!tok){out.push('Không có AccessToken, bỏ qua bước gửi OTP.');return out.join('\n')}
let ro
try{ro=await cu('https://cloud-api.bestmoon.vn/core/user/otp/send/verify_mail',[...b2,'-H','accept: application/json','-H','authorization: Bearer '+tok,'-H','Origin: https://cloudphone.bestmoon.vn','-H','Referer: https://cloudphone.bestmoon.vn/'])}
catch(e){out.push('','Lỗi kết nối khi gửi OTP: '+e.message);return out.join('\n')}
let s=null
try{s=JSON.parse(ro)}catch(e){}
if(!(s&&s.success)){out.push('','Gửi OTP thất bại: '+String((s&&s.message)||ro.slice(0,300)));return out.join('\n')}
await say(c,out.join('\n')+'\n\nĐÃ GỬI MÃ OTP thành công! Đang vào inbox '+em+' để tìm mã (tối đa ~60 giây)...')
const q=await readOtp(em)
if(!q.otp)return 'Không lấy được mã OTP sau 30 lần quét. Lỗi cuối: '+q.err+'\n\n'+acc
await say(c,'MÃ OTP: '+q.otp+(q.subject?'\nTiêu đề thư: '+q.subject:'')+'\n\nĐang vào bestmoon.vn để xác thực email...')
let bc
try{bc=(await cu('https://bestmoon.vn/',[...b2,'-o','/dev/null','-w','%{http_code}'])).trim()}catch(e){bc='lỗi: '+e.message}
let vr
try{vr=await cu('https://cloud-api.bestmoon.vn/core/user/otp/verify',[...b2,'-H','accept: application/json','-H','authorization: Bearer '+tok,'-H','content-type: application/json; charset=utf-8','-H','Origin: https://bestmoon.vn','-H','Referer: https://bestmoon.vn/','-d',JSON.stringify({OtpCode:q.otp.trim(),type:'verify_mail'})])}
catch(e){return 'Có mã OTP '+q.otp+' nhưng lỗi kết nối khi xác thực: '+e.message+'\nbestmoon.vn: HTTP '+bc+'\n\n'+acc}
let v=null
try{v=JSON.parse(vr)}catch(e){}
if(v&&v.success){
await say(c,'XÁC THỰC EMAIL THÀNH CÔNG!\nMã OTP: '+q.otp+'\nbestmoon.vn: HTTP '+bc+'\n\nĐang vào bestmoon.io và đăng nhập lại...')
return await io(us,pw,acc)
}
const why=(v&&v.message)||(v&&v.data!=null?JSON.stringify(v.data):'')||vr.slice(0,300)
return 'Xác thực email thất bại: '+why+'\nMã OTP: '+q.otp+'\nbestmoon.vn: HTTP '+bc+'\n\n'+acc
}
try{
const code=(await cu('https://www.emailnator.com/',[...b1,'-o','/dev/null','-w','%{http_code}'])).trim()
if(code!=='200')return 'Vào emailnator.com thất bại, HTTP '+code+' (có thể IP proxy bị chặn hoặc dính Cloudflare).'
await say(c,'Vào emailnator OK (HTTP 200). Đang tìm email @gmail.com...')
let g=await gen()
if(!g.em)return 'Không lấy được @gmail.com sau 15 lần thử. Lỗi cuối: '+g.err
let em=g.em
await say(c,'Email tạm: '+em+'\nInbox: '+inbox(em)+'\nĐang mở tab mới: cloudphone.bestmoon.vn...')
let cc
try{cc=(await cu('https://cloudphone.bestmoon.vn/',[...b2,'-o','/dev/null','-w','%{http_code}'])).trim()}catch(e){return 'Không vào được cloudphone.bestmoon.vn: '+e.message}
await say(c,'Vào cloudphone.bestmoon.vn: HTTP '+cc+'. Đang đăng ký tài khoản...')
let last=''
for(let n=1;n<=5;n++){
const us=rUser()
const pw=rPass()
const body=JSON.stringify({userName:us,password:pw,confirmPassword:pw,email:em})
let r
try{r=await cu('https://cloud-api.bestmoon.vn/authen/register',[...b2,...H2,'-d',body])}
catch(e){return 'Lỗi kết nối cloud-api.bestmoon.vn: '+e.message}
let j
try{j=JSON.parse(r)}catch(e){return 'Phản hồi đăng ký không phải JSON: '+r.slice(0,300)}
if(j&&j.success){
await say(c,'ĐĂNG KÝ THÀNH CÔNG!\nUsername: '+us+'\nPassword: '+pw+'\nEmail: '+em+'\nInbox: '+inbox(em)+'\n\nĐang đăng nhập...')
return await login(us,pw,em)
}
last=String((j&&j.message)||r.slice(0,300))
if(!/exist|tồn tại|already|đã được|đã dùng|đã sử dụng|trùng|duplicate/i.test(last))return 'Đăng ký thất bại: '+last+'\n\nPhản hồi gốc: '+r.slice(0,300)
if(n===5)break
await say(c,'Lần '+n+': '+last+'\nĐang đổi email khác...')
g=await gen()
if(!g.em)return 'Không lấy được email mới. Lỗi cuối: '+g.err
em=g.em
await say(c,'Email mới: '+em)
}
return 'Thất bại sau 5 lần đổi email. Lỗi cuối: '+last
}finally{fs.rmSync(j1,{force:true});fs.rmSync(j2,{force:true})}
},
get:async(a,c)=>{
const o=await cu(chk(a),['-w','\n%{http_code}'])
const i=o.lastIndexOf('\n')
const t=txt(o.slice(0,i)),code=o.slice(i+1)
if(t.length<=MAXTXT)return code+'\n'+t
await sendFile(c,Buffer.from(t),'page.txt')
return code+' - nội dung dài ('+t.length+' ký tự), đã gửi file page.txt'
},
raw:async(a,c)=>{await sendFile(c,Buffer.from(await cu(chk(a))),'page.html');return 'xong'},
head:async a=>(await cu(chk(a),['-I'])).trim(),
dl:async(a,c)=>{
a=chk(a)
const f=os.tmpdir()+'/dl'+Date.now()
try{
await cu(a,['-o',f,'--max-filesize','48000000'])
await sendFile(c,fs.readFileSync(f),a.split(/[?#]/)[0].split('/').pop()||'file')
return 'xong'
}finally{fs.rmSync(f,{force:true})}
},
sh:a=>run(a),
wifi:()=>run('termux-wifi-connectioninfo')
}
const handle=async m=>{
const i=m.text.search(/\s/)
const h=i<0?m.text:m.text.slice(0,i)
const a=i<0?'':m.text.slice(i+1).trim()
const n=h.slice(1).split('@')[0].toLowerCase()
const f=h[0]==='/'&&Object.prototype.hasOwnProperty.call(cmd,n)?cmd[n]:null
if(!f)return say(m.chat.id,HELP)
try{await say(m.chat.id,await f(a,m.chat.id,m.message_id))}catch(e){await say(m.chat.id,'Lỗi: '+e.message)}
}
let off=0
const loop=async()=>{
console.log('Bot đang chạy...')
for(;;){
try{
const d=await api('getUpdates',{offset:off,timeout:50})
if(!d.ok){console.log('getUpdates lỗi:',d.description);await sleep(3000);continue}
for(const u of d.result){
off=u.update_id+1
const m=u.message
if(!m||!m.text||!m.from||String(m.from.id)!==O)continue
handle(m).catch(()=>{})
}
}catch(e){await sleep(3000)}
}
}
loop()
EOF
