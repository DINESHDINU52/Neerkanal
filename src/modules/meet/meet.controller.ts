import {
  Controller,
  Get,
  Param,
  Res,
} from '@nestjs/common';
import * as fs from 'fs';
import { Public } from '../../common/decorators/auth.decorators';

import * as path from 'path';

/* Built-in "Nerkanal Meet" page (WebRTC mesh, Google-Meet-like) + root homepage */
@Controller()
export class MeetCtl {
  @Public()
  @Get('meet/:roomId')
  page(@Param('roomId') roomId: string, @Res() res: any) {
    res.type('html').send(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>Nerkanal Meet</title>
<style>body{margin:0;background:#0b1f4b;color:#fff;font-family:system-ui}#g{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px;padding:8px}video{width:100%;background:#000;border-radius:10px}header{padding:10px 16px;background:#06143a;color:#e1a82d;font-weight:700}#bar{position:fixed;bottom:0;left:0;right:0;padding:10px;text-align:center;background:#06143a}button{background:#e1a82d;border:0;border-radius:8px;padding:8px 14px;margin:0 4px;font-weight:700}</style>
<header>Nerkanal Meet · room ${roomId.replace(/[^\w-]/g, '')}</header><div id=g></div><div id=bar><button id=m>Mute</button><button id=c>Camera</button><button onclick="location='/'">Leave</button></div>
<script src="/socket.io/socket.io.js"></script><script>
const room="${roomId.replace(/[^\w-]/g, '')}",q=new URLSearchParams(location.search);let token=q.get('token')||localStorage.getItem('nk_token')||prompt('Paste your Nerkanal access token');localStorage.setItem('nk_token',token);
const name=prompt('Your name')||'Guest',s=io({auth:{token}}),peers={},g=document.getElementById('g');let me;
const cfg={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};
function tile(id,stream){let v=document.getElementById(id);if(!v){v=document.createElement('video');v.id=id;v.autoplay=true;v.playsInline=true;g.appendChild(v)}v.srcObject=stream;return v}
function pc(id){const p=new RTCPeerConnection(cfg);peers[id]=p;me.getTracks().forEach(t=>p.addTrack(t,me));p.onicecandidate=e=>e.candidate&&s.emit('signal',{to:id,data:{ice:e.candidate}});p.ontrack=e=>tile(id,e.streams[0]);return p}
(async()=>{me=await navigator.mediaDevices.getUserMedia({video:true,audio:true});tile('me',me).muted=true;s.emit('join',{roomId:room,name});
s.on('denied',m=>{alert(m);location='/'});
s.on('peers',async l=>{for(const x of l){const p=pc(x.id);const o=await p.createOffer();await p.setLocalDescription(o);s.emit('signal',{to:x.id,data:{sdp:p.localDescription}})}});
s.on('signal',async({from,data})=>{const p=peers[from]||pc(from);if(data.sdp){await p.setRemoteDescription(data.sdp);if(data.sdp.type==='offer'){const a=await p.createAnswer();await p.setLocalDescription(a);s.emit('signal',{to:from,data:{sdp:p.localDescription}})}}if(data.ice)try{await p.addIceCandidate(data.ice)}catch(e){}});
s.on('peer-left',({id})=>{peers[id]?.close();delete peers[id];document.getElementById(id)?.remove()});
m.onclick=()=>me.getAudioTracks().forEach(t=>t.enabled=!t.enabled);c.onclick=()=>me.getVideoTracks().forEach(t=>t.enabled=!t.enabled)})();
</script>`);
  }

  @Public()
  @Get()
  home(@Res() res: any) {
    const indexPath = path.resolve('public/index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    const logo = fs.existsSync('public/logo.png')
      ? '<img src="/logo.png" height=120>'
      : '';
    res
      .type('html')
      .send(
        `<body style="font-family:system-ui;text-align:center;padding:48px;background:#fff;color:#0B1F4B">${logo}<h1>Nerkanal</h1><p>HRMS · ATS · Candidate Portal API is running.</p><p><a href="/docs" style="color:#b8860b">Open API console (Swagger)</a></p></body>`,
      );
  }
}
