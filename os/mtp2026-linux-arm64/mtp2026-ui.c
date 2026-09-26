#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/input.h>
#include <linux/fb.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/wait.h>
#include <unistd.h>
#include <dirent.h>
#include <signal.h>
#include <time.h>

typedef struct { int fd,w,h,bpp,stride; uint8_t *mem; size_t len; } FB;
static FB fb={-1,0,0,0,0,NULL,0};
static const char *profile="mtp2026", *profile_name="MTP2026 Guest OS";
static int page=0,cursor=0,running=1,pointer_x=0,pointer_y=0,browser_pid=0;
static int desktop_view=0; /* 0 boot/lock, 1 desktop, 2 start, 3 explorer, 4 settings */
static time_t boot_time=0;
static const uint32_t C_BG=0x10151f,C_PANEL=0x1d2430,C_PANEL2=0x252d3b,C_TEXT=0xf3f6fb,C_MUTED=0xb8c2d1,C_ACCENT=0x4cc9f0,C_BLUE=0x1677ff,C_WHITE=0xffffff,C_GOOD=0x43e0a3,C_WARN=0xf5c86b;

static uint32_t rgb(uint8_t r,uint8_t g,uint8_t b){return ((uint32_t)r<<16)|((uint32_t)g<<8)|b;}
static void pixel(int x,int y,uint32_t c){
  if(!fb.mem||x<0||y<0||x>=fb.w||y>=fb.h)return;
  uint8_t *p=fb.mem+y*fb.stride+x*(fb.bpp/8);
  if(fb.bpp==32)*(uint32_t*)p=0xff000000u|c;
  else if(fb.bpp==16)*(uint16_t*)p=(uint16_t)(((c>>19)<<11)|(((c>>10)&63)<<5)|((c>>3)&31));
}
static void rect(int x,int y,int w,int h,uint32_t c){for(int yy=y;yy<y+h;yy++)for(int xx=x;xx<x+w;xx++)pixel(xx,yy,c);}
static void border(int x,int y,int w,int h,uint32_t c){rect(x,y,w,2,c);rect(x,y+h-2,w,2,c);rect(x,y,2,h,c);rect(x+w-2,y,2,h,c);}
static const uint8_t font[38][7]={
{14,17,17,31,17,17,17},{30,17,17,30,17,17,30},{14,17,16,16,16,17,14},{30,17,17,17,17,17,30},{31,16,16,30,16,16,31},{31,16,16,30,16,16,16},{14,17,16,23,17,17,15},{17,17,17,31,17,17,17},{31,4,4,4,4,4,31},{1,1,1,1,17,17,14},{17,18,20,24,20,18,17},{16,16,16,16,16,16,31},{17,27,21,21,17,17,17},{17,25,21,19,17,17,17},{14,17,17,17,17,17,14},{30,17,17,30,16,16,16},{14,17,17,17,21,18,13},{30,17,17,30,20,18,17},{15,16,16,14,1,1,30},{31,4,4,4,4,4,4},{17,17,17,17,17,10,4},{17,17,17,17,17,10,4},{17,17,17,21,21,27,17},{17,17,10,4,10,17,17},{17,17,10,4,4,4,4},{31,1,2,4,8,16,31},{0,0,0,0,0,0,0},{14,17,19,21,25,17,14},{30,17,17,30,17,17,30},{14,16,16,16,16,16,14},{30,17,17,17,17,17,30},{31,16,16,30,16,16,31},{14,17,16,23,17,17,15},{17,17,17,31,17,17,17},{31,4,4,4,4,4,31},{1,1,1,1,17,17,14},{17,18,20,24,20,18,17}};
static int glyph(char c){if(c>='a'&&c<='z')c=(char)(c-'a'+'A');if(c>='A'&&c<='Z')return c-'A';if(c==' ')return 26;return -1;}
static void text(int x,int y,const char*s,int scale,uint32_t c){
  for(;*s;s++,x+=6*scale){int g=glyph(*s);if(g<0)continue;for(int yy=0;yy<7;yy++)for(int xx=0;xx<5;xx++)if(font[g][yy]&(1<<(4-xx)))rect(x+xx*scale,y+yy*scale,scale,scale,c);}
}
static void open_fb(void){
  if(fb.mem)return;
  fb.fd=open("/dev/fb0",O_RDWR);if(fb.fd<0)return;
  struct fb_var_screeninfo v;struct fb_fix_screeninfo f;
  if(ioctl(fb.fd,FBIOGET_VSCREENINFO,&v)||ioctl(fb.fd,FBIOGET_FSCREENINFO,&f)){close(fb.fd);fb.fd=-1;return;}
  fb.w=v.xres;fb.h=v.yres;fb.bpp=v.bits_per_pixel;fb.stride=f.line_length;fb.len=(size_t)fb.stride*fb.h;
  fb.mem=mmap(NULL,fb.len,PROT_READ|PROT_WRITE,MAP_SHARED,fb.fd,0);if(fb.mem==MAP_FAILED)fb.mem=NULL;
}
static void close_fb(void){if(fb.mem)munmap(fb.mem,fb.len);fb.mem=NULL;if(fb.fd>=0)close(fb.fd);fb.fd=-1;}
static void action(const char *cmd){pid_t p=fork();if(p==0){execl("/bin/sh","sh","-c",cmd,(char*)NULL);_exit(127);}if(p>0)waitpid(p,NULL,0);}
static void launch_url(const char *url){
  if(browser_pid>0){kill(browser_pid,SIGTERM);waitpid(browser_pid,NULL,0);browser_pid=0;}
  const char *safe=url&&strncmp(url,"https://",8)==0?url:"https://vexaaccount-management.onrender.com";
  browser_pid=fork();if(browser_pid==0){execl("/usr/bin/mtp2026-browser","mtp2026-browser",safe,(char*)NULL);_exit(127);}
}
static void draw_lock(void){
  rect(0,0,fb.w,fb.h,rgb(18,27,45));
  for(int i=0;i<10;i++)rect(0,i*fb.h/10,fb.w,fb.h/20,rgb(18+i,27+i,45+i));
  text(34,34,"MTP2026 DESKTOP OS",3,C_WHITE);
  text(fb.w/2-130,fb.h/2-70,"MTP2026",6,C_WHITE);
  text(fb.w/2-170,fb.h/2+5,"SIGN IN WITH VEXAACCOUNT",2,C_MUTED);
  rect(fb.w/2-170,fb.h/2+45,340,54,C_PANEL2);border(fb.w/2-170,fb.h/2+45,340,54,C_ACCENT);
  text(fb.w/2-105,fb.h/2+64,"PRESS ENTER TO UNLOCK",2,C_TEXT);
  text(30,fb.h-45,"MTP2026 ARM64 GUEST  •  VEXAACCOUNT IDENTITY",2,C_MUTED);
}
static void draw_taskbar(void){
  int y=fb.h-64;
  rect(0,y,fb.w,64,0x161c27);rect(0,y,fb.w,2,0x344052);
  int cx=fb.w/2;
  rect(cx-155,y+10,42,42,0x243044); text(cx-146,y+21,"M",3,C_ACCENT);
  rect(cx-105,y+10,42,42,0x243044); text(cx-96,y+21,"S",3,C_TEXT);
  rect(cx-55,y+10,42,42,0x243044); text(cx-46,y+21,"F",3,C_TEXT);
  rect(cx-5,y+10,42,42,0x243044); text(cx+4,y+21,"B",3,C_TEXT);
  rect(cx+45,y+10,42,42,0x243044); text(cx+54,y+21,"G",3,C_TEXT);
  rect(fb.w-180,y+10,155,42,0x202937); text(fb.w-165,y+21,"NET  SOUND",1,C_MUTED);
}
static void draw_desktop(void){
  rect(0,0,fb.w,fb.h,C_BG);
  rect(0,0,fb.w,38,0x111822);
  text(24,13,"MTP2026 DESKTOP",2,C_TEXT);
  text(fb.w-230,13,"VEXAACCOUNT  ONLINE",1,C_GOOD);
  /* Desktop icons */
  const char *icons[]={"THIS PC","VEXASTORE","BROWSER","FILES","RECYCLE BIN"};
  for(int i=0;i<5;i++){int yy=72+i*90;rect(30,yy,52,52,0x26354a);border(30,yy,52,52,0x4a607b);text(39,yy+18,i==0?"PC":i==1?"VS":i==2?"WEB":i==3?"DOC":"BIN",1,C_TEXT);text(25,yy+62,icons[i],1,C_TEXT);}
  text(155,90,"MTP2026 DESKTOP WORKSPACE",3,C_WHITE);
  text(155,132,"ARM64 LINUX GUEST • DESKTOP-STYLE SHELL",2,C_MUTED);
  rect(155,175,300,115,C_PANEL);text(175,198,"VEXAACCOUNT",2,C_ACCENT);text(175,232,"CONNECTED IDENTITY",2,C_TEXT);text(175,264,"CLOUD APPS READY",1,C_GOOD);
  rect(480,175,300,115,C_PANEL);text(500,198,"VEXASTORE",2,C_ACCENT);text(500,232,"APPLICATION LIBRARY",2,C_TEXT);text(500,264,"OPEN STORE",1,C_GOOD);
  rect(805,175,300,115,C_PANEL);text(825,198,"SYSTEM",2,C_ACCENT);text(825,232,"MTP2026 ARM64",2,C_TEXT);text(825,264,"SETTINGS AVAILABLE",1,C_GOOD);
  text(155,340,"USE START MENU FOR APPS, FILES, SETTINGS AND POWER",2,C_MUTED);
  draw_taskbar();
}
static void draw_start(void){
  draw_desktop();int w=620,h=470,x=(fb.w-w)/2,y=fb.h-64-h-20;
  rect(x,y,w,h,0x202733);border(x,y,w,h,0x3b475a);
  text(x+32,y+28,"MTP2026",3,C_WHITE);text(x+32,y+70,"SEARCH APPS AND SETTINGS",1,C_MUTED);
  rect(x+30,y+92,w-60,44,0x2b3443);text(x+48,y+107,"TYPE OR SELECT AN APP",1,C_MUTED);
  const char *apps[]={"VEXASTORE","BROWSER","FILES","SETTINGS","NETWORK","ACCOUNT","POWER","WEBAPPS"};
  for(int i=0;i<8;i++){int bx=x+30+(i%4)*140,by=y+160+(i/4)*92;rect(bx,by,120,70,i==cursor?0x34506e:0x293342);text(bx+15,by+25,apps[i],1,C_TEXT);}
  text(x+32,y+h-35,"VEXAACCOUNT   •   MTP2026 ARM64",1,C_MUTED);
}
static void draw_explorer(void){
  rect(0,0,fb.w,fb.h,C_BG);rect(0,0,fb.w,55,0x161d28);
  text(24,18,"FILE EXPLORER",3,C_WHITE);text(fb.w-240,22,"MTP2026 STORAGE",1,C_MUTED);
  rect(0,55,220,fb.h-119,0x151c27);
  const char *nav[]={"HOME","DESKTOP","DOCUMENTS","DOWNLOADS","PICTURES","MUSIC","GAMES","APPS"};
  for(int i=0;i<8;i++){int yy=75+i*50;rect(12,yy,196,38,i==cursor?0x2b4661:0x202a37);text(26,yy+13,nav[i],1,C_TEXT);}
  text(250,90,"THIS PC",3,C_WHITE);
  const char *folders[]={"DESKTOP","DOCUMENTS","DOWNLOADS","PICTURES","MUSIC","GAMES","APPS","STORAGE"};
  for(int i=0;i<8;i++){int bx=250+(i%4)*190,by=135+(i/4)*105;rect(bx,by,165,78,i==cursor?0x304964:0x222c3a);text(bx+15,by+23,"[DIR]",1,C_ACCENT);text(bx+15,by+49,folders[i],1,C_TEXT);}
  text(250,370,"ENTER OPENS SELECTED DIRECTORY",1,C_MUTED);draw_taskbar();
}
static void draw_settings(void){
  rect(0,0,fb.w,fb.h,C_BG);rect(0,0,fb.w,58,0x171f2b);
  text(25,19,"SETTINGS",3,C_WHITE);text(fb.w-260,22,"MTP2026 DESKTOP OS",1,C_MUTED);
  rect(0,58,250,fb.h-122,0x151c27);
  const char *cats[]={"SYSTEM","BLUETOOTH","NETWORK","PERSONALIZATION","APPS","ACCOUNTS","TIME & LANGUAGE","PRIVACY","WINDOWS UPDATE"};
  for(int i=0;i<9;i++){int yy=72+i*43;rect(12,yy,226,34,i==cursor?0x2d4760:0x202a37);text(25,yy+12,cats[i],1,C_TEXT);}
  int x=285;text(x,92,cats[cursor],3,C_WHITE);
  if(cursor==0){text(x,145,"DISPLAY",2,C_ACCENT);text(x,180,"RESOLUTION   AUTO",2,C_TEXT);text(x,215,"ORIENTATION  LANDSCAPE",2,C_TEXT);text(x,250,"GPU           VIRTIO",2,C_TEXT);}
  else if(cursor==2){text(x,145,"NETWORK STATUS",2,C_ACCENT);text(x,180,"VIRTIO ETHERNET",2,C_TEXT);text(x,215,"DHCP / USER NETWORK",2,C_TEXT);text(x,250,"PRESS ENTER TO REFRESH",1,C_GOOD);}
  else if(cursor==4){text(x,145,"INSTALLED APPS",2,C_ACCENT);text(x,180,"VEXASTORE APPLICATIONS",2,C_TEXT);text(x,215,"WEBAPPS / PWA",2,C_TEXT);}
  else if(cursor==5){text(x,145,"VEXAACCOUNT",2,C_ACCENT);text(x,180,"CLOUD IDENTITY SESSION",2,C_TEXT);text(x,215,"OPEN ACCOUNT TO MANAGE",2,C_GOOD);}
  else {text(x,145,"MTP2026 SYSTEM CONTROL",2,C_ACCENT);text(x,180,"PROFILE: DESKTOP",2,C_TEXT);text(x,215,"ARM64 • QEMU VIRT",2,C_TEXT);text(x,250,"ENTER OPENS CONTROL",1,C_GOOD);}
  draw_taskbar();
}
static void draw_splash(void){
  rect(0,0,fb.w,fb.h,0x0b1020);
  int cx=fb.w/2,cy=fb.h/2-45;int phase=(int)(time(NULL)-boot_time);
  rect(cx-58,cy-58,116,116,0x1c2a43);border(cx-58,cy-58,116,116,C_ACCENT);
  text(cx-35,cy-15,"MTP",4,C_WHITE);
  text(cx-120,cy+90,"MTP2026 DESKTOP OS",3,C_TEXT);
  text(cx-145,cy+130,phase%2?"STARTING SERVICES":"LOADING ARM64 GUEST",1,C_MUTED);
  rect(cx-180,cy+165,360,6,0x273347);rect(cx-180,cy+165,(phase%6+1)*60,6,C_ACCENT);
}

static uint32_t profile_accent(void){
  if(strcmp(profile,"android")==0) return 0x63d9a5;
  if(strcmp(profile,"gaming")==0) return 0xff6b8a;
  if(strcmp(profile,"desktop")==0) return 0x4cc9f0;
  return 0x8b7cff;
}
static const char *profile_title(void){
  if(strcmp(profile,"android")==0) return "MTP2026 ANDROID OS";
  if(strcmp(profile,"gaming")==0) return "MTP2026 GAMING OS";
  if(strcmp(profile,"desktop")==0) return "MTP2026 DESKTOP OS";
  return "MTP2026 DEVICE OS";
}
static const char *profile_tagline(void){
  if(strcmp(profile,"android")==0) return "MOBILE • APK HOST • WEBAPPS • GESTURES";
  if(strcmp(profile,"gaming")==0) return "GAME HUB • CONTROLLER • PERFORMANCE";
  if(strcmp(profile,"desktop")==0) return "DESKTOP • TASKBAR • KEYBOARD • MOUSE";
  return "MOBILE • TOUCH • CONTROL CENTER • WEBAPPS";
}
static void run_background(const char *cmd){
  pid_t p=fork(); if(p==0){setsid(); execl("/bin/sh","sh","-c",cmd,(char*)NULL); _exit(127);}
}
static void launch_browser(const char *url){ launch_url(url); }
static void app_action(int id){
  switch(id){
    case 0: launch_browser("https://www.vexastore.2bd.net/"); break;
    case 1: launch_browser(NULL); break;
    case 2: launch_browser("https://mtp2026-app-launcher.onrender.com/"); break;
    case 3: launch_browser("https://vexaaccount-management.onrender.com/"); break;
    case 4: run_background("mkdir -p /mnt/device-storage/{Desktop,Documents,Downloads,Pictures,Music,Games,Apps}; ls -la /mnt/device-storage >/run/mtp2026/files-action.log 2>&1"); break;
    case 5: run_background("date -u +%Y-%m-%dT%H:%M:%SZ >/run/mtp2026/settings.state"); break;
    case 6: run_background("ifconfig eth0 up 2>/dev/null || true; udhcpc -q -n -i eth0 >/run/mtp2026/network-action.log 2>&1 || true"); break;
    case 7: run_background("echo notification-opened >/run/mtp2026/notifications.state"); break;
    case 8: run_background("sync"); break;
    case 9: run_background("poweroff -f"); break;
  }
}
static void draw_header(const char *title){
  uint32_t a=profile_accent();
  rect(0,0,fb.w,58,rgb(9,18,30)); text(20,17,title,3,a);
  text(fb.w-285,21,"VEXAACCOUNT  ONLINE",1,C_GOOD);
}
static void draw_button(int x,int y,int w,int h,const char *label,int active){
  uint32_t a=profile_accent();
  rect(x,y,w,h,active?rgb(35,62,82):rgb(24,34,47));
  border(x,y,w,h,active?a:rgb(54,67,83));
  int tw=(int)strlen(label)*6; text(x+(w-tw)/2,y+h/2-4,label,1,C_TEXT);
}
static void draw_mobile_nav(void){
  int y=fb.h-68; uint32_t a=profile_accent();
  rect(0,y,fb.w,68,rgb(8,17,29));
  const char *n[]={"HOME","APPS","FILES","SET","ACCOUNT"};
  for(int i=0;i<5;i++){int x=i*fb.w/5; if(i==page-1)rect(x+8,y+7,fb.w/5-16,54,rgb(25,48,64)); text(x+18,y+23,n[i],1,i==page-1?a:C_TEXT);}
  if(strcmp(profile,"android")==0){ text(18,y+49,"◀",1,C_MUTED); text(fb.w/2-8,y+49,"●",1,C_MUTED); text(fb.w-28,y+49,"□",1,C_MUTED); }
  else { text(fb.w-105,y+49,"QUICK",1,C_MUTED); text(fb.w-48,y+49,"⏻",1,C_MUTED); }
}
static void draw_desktop_taskbar(void){
  int y=fb.h-64; rect(0,y,fb.w,64,0x161c27); rect(0,y,fb.w,2,profile_accent());
  int cx=fb.w/2; const char *n[]={"START","STORE","FILES","WEB","GAME"};
  for(int i=0;i<5;i++){int x=cx-155+i*50; draw_button(x,y+9,42,43,n[i],0);}
  text(fb.w-150,y+24,"NET  SOUND",1,C_MUTED);
}
static void draw_home(void){
  uint32_t a=profile_accent();
  if(strcmp(profile,"desktop")==0){ draw_desktop(); return; }
  rect(0,0,fb.w,fb.h,rgb(5,10,20)); draw_header(profile_title());
  text(25,84,profile_tagline(),1,C_MUTED);
  rect(24,110,fb.w-48,118,rgb(14,29,44)); border(24,110,fb.w-48,118,a);
  text(45,132,"VEXAACCOUNT",2,a); text(45,166,"CONNECTED CLOUD IDENTITY",2,C_TEXT);
  text(45,198,"VEXASTORE • WEBAPPS • SYNC READY",1,C_GOOD);
  int y=250,w=(fb.w-68)/2;
  const char *b1=strcmp(profile,"gaming")==0?"GAME HUB":"APPLICATIONS";
  const char *b2=strcmp(profile,"android")==0?"APK HOST":"WEBAPPS";
  draw_button(24,y,w,64,b1,0); draw_button(44+w,y,w,64,b2,0);
  draw_button(24,y+82,w,64,"FILES",0); draw_button(44+w,y+82,w,64,"SETTINGS",0);
  draw_button(24,y+164,w,64,"NOTIFICATIONS",0); draw_button(44+w,y+164,w,64,"POWER",0);
  if(strcmp(profile,"android")==0 || strcmp(profile,"mtp2026")==0) draw_mobile_nav();
}
static void draw_apps(void){
  uint32_t a=profile_accent(); rect(0,0,fb.w,fb.h,rgb(5,10,20)); draw_header("APPLICATIONS");
  text(24,83,strcmp(profile,"gaming")==0?"GAME HUB":"MTP2026 APPLICATION CENTER",2,C_TEXT);
  const char *apps[]={"VEXASTORE","BROWSER","WEBAPPS","VEXAACCOUNT",
                      strcmp(profile,"android")?"FILES":"APK HOST",
                      "SETTINGS","NETWORK","NOTIFICATIONS"};
  for(int i=0;i<8;i++){int col=i%2,row=i/2;int x=24+col*((fb.w-68)/2+20),y=112+row*78,w=(fb.w-68)/2;
    draw_button(x,y,w,62,apps[i],cursor==i);
  }
  text(24,fb.h-90,"ENTER / TAP opens the selected service",1,C_MUTED);
  if(strcmp(profile,"android")==0 || strcmp(profile,"mtp2026")==0) draw_mobile_nav();
  else if(strcmp(profile,"gaming")==0) draw_desktop_taskbar();
}
static void draw_files(void){
  rect(0,0,fb.w,fb.h,rgb(7,12,20)); draw_header("FILES");
  text(24,82,"MTP2026 DEVICE STORAGE",2,C_TEXT);
  const char *dirs[]={"DESKTOP","DOCUMENTS","DOWNLOADS","PICTURES","MUSIC","GAMES","APPS","DEVICE STORAGE"};
  for(int i=0;i<8;i++){int col=i%2,row=i/2,x=24+col*((fb.w-68)/2+20),y=112+row*72,w=(fb.w-68)/2;
    draw_button(x,y,w,56,dirs[i],cursor==i);
  }
  if(strcmp(profile,"desktop")==0) draw_desktop_taskbar(); else draw_mobile_nav();
}
static void draw_settings_page(void){
  rect(0,0,fb.w,fb.h,rgb(7,12,20)); draw_header("SETTINGS");
  const char *items[]={"DISPLAY","ORIENTATION","NETWORK","SOUND","NOTIFICATIONS","ACCOUNT","STORAGE","POWER"};
  for(int i=0;i<8;i++){int col=i%2,row=i/2,x=24+col*((fb.w-68)/2+20),y=84+row*72,w=(fb.w-68)/2;
    draw_button(x,y,w,56,items[i],cursor==i);
  }
  int y=382; text(25,y,"PROFILE",1,C_MUTED); text(100,y,profile_title(),1,C_TEXT);
  text(25,y+25,"ARCHITECTURE",1,C_MUTED); text(100,y+25,"ARM64 / QEMU VIRT",1,C_TEXT);
  text(25,y+50,"IDENTITY",1,C_MUTED); text(100,y+50,"VEXAACCOUNT",1,C_TEXT);
  draw_mobile_nav();
}
static void draw_network(void){
  rect(0,0,fb.w,fb.h,rgb(6,13,22)); draw_header("NETWORK");
  text(24,86,"VIRTIO NETWORK",3,profile_accent());
  text(24,130,"INTERFACE",1,C_MUTED); text(140,130,"eth0",2,C_TEXT);
  text(24,164,"DHCP",1,C_MUTED); text(140,164,"USER NETWORK",2,C_TEXT);
  text(24,198,"STATUS",1,C_MUTED); text(140,198,"PRESS ENTER TO REFRESH",1,C_GOOD);
  draw_button(24,235,fb.w-48,58,"CONNECT / REFRESH NETWORK",1);
  draw_button(24,305,fb.w-48,58,"OPEN VEXAACCOUNT BROWSER",0);
  draw_button(24,375,fb.w-48,58,"BACK TO HOME",0);
}
static void draw_notifications(void){
  rect(0,0,fb.w,fb.h,rgb(7,12,20)); draw_header("NOTIFICATIONS");
  text(24,85,"MTP2026 NOTIFICATION CENTER",2,C_TEXT);
  rect(24,112,fb.w-48,70,rgb(18,31,43)); text(42,132,"SYSTEM",1,profile_accent());
  text(42,157,"Guest services are running",1,C_TEXT);
  rect(24,194,fb.w-48,70,rgb(18,31,43)); text(42,214,"ACCOUNT",1,profile_accent());
  text(42,239,"VexaAccount identity is available",1,C_TEXT);
  rect(24,276,fb.w-48,70,rgb(18,31,43)); text(42,296,"STORE",1,profile_accent());
  text(42,321,"VexaStore application catalog ready",1,C_TEXT);
  draw_button(24,365,fb.w-48,58,"CLEAR / ACKNOWLEDGE",0);
}
static void draw_account(void){
  rect(0,0,fb.w,fb.h,rgb(6,13,22)); draw_header("VEXAACCOUNT");
  rect(24,90,fb.w-48,118,rgb(16,31,44)); border(24,90,fb.w-48,118,profile_accent());
  text(44,112,"VEXAACCOUNT",3,profile_accent()); text(44,153,"IDENTITY AUTHORITY",2,C_TEXT);
  text(44,184,"SESSION: LAUNCHER-MANAGED",1,C_GOOD);
  draw_button(24,235,fb.w-48,60,"OPEN ACCOUNT",1);
  draw_button(24,305,fb.w-48,60,"REFRESH SESSION",0);
  draw_button(24,375,fb.w-48,60,"BACK TO HOME",0);
}
static void draw_power(void){
  rect(0,0,fb.w,fb.h,rgb(6,13,22)); draw_header("POWER");
  text(24,90,"MTP2026 POWER CONTROLS",2,C_TEXT);
  draw_button(24,135,fb.w-48,65,"REBOOT GUEST",0);
  draw_button(24,215,fb.w-48,65,"POWER OFF GUEST",0);
  draw_button(24,295,fb.w-48,65,"SYNC STORAGE",0);
  draw_button(24,375,fb.w-48,65,"BACK TO HOME",0);
}
static void draw(void){
  if(!fb.mem)return;
  if(strcmp(profile,"desktop")==0){
    if(desktop_view==0)draw_lock();
    else if(desktop_view==1)draw_desktop();
    else if(desktop_view==2)draw_start();
    else if(desktop_view==3)draw_explorer();
    else draw_settings();
    return;
  }
  switch(page){
    case 0: draw_home(); break;
    case 1: draw_apps(); break;
    case 2: draw_files(); break;
    case 3: draw_settings_page(); break;
    case 4: draw_network(); break;
    case 5: draw_notifications(); break;
    case 6: draw_account(); break;
    default: draw_power(); break;
  }
}
static int page_from_touch(void){
  int navh=68;
  if((strcmp(profile,"android")==0 || strcmp(profile,"mtp2026")==0) && pointer_y>=fb.h-navh){
    int i=pointer_x/(fb.w/5); return i==0?0:i==1?1:i==2?2:i==3?3:6;
  }
  return -1;
}
static int button_from_touch(int p){
  if(p==1 || p==2){
    int y0=(p==1)?112:112, step=78;
    if(pointer_y>=y0 && pointer_y<y0+4*step+62){
      int row=(pointer_y-y0)/step,col=pointer_x<fb.w/2?0:1;
      int id=row*2+col; return id<8?id:-1;
    }
  }
  if(p==3){int y0=84,step=72;if(pointer_y>=y0&&pointer_y<y0+4*step+56){int row=(pointer_y-y0)/step,col=pointer_x<fb.w/2?0:1;return row*2+col;}}
  return -1;
}
static void guest_action(int id){
  if(page==1){ app_action(id); return; }
  if(page==2){
    const char *dirs[]={"Desktop","Documents","Downloads","Pictures","Music","Games","Apps","."};
    if(id>=0&&id<8){char cmd[320];snprintf(cmd,sizeof(cmd),"mkdir -p /mnt/device-storage/%s; ls -la /mnt/device-storage/%s >/run/mtp2026/files-action.log 2>&1",dirs[id],dirs[id]);run_background(cmd);}
    return;
  }
  if(page==3){
    if(id==0)run_background("printf 'display=auto\\n' >/run/mtp2026/settings.state");
    else if(id==1)run_background("printf 'orientation=landscape\\n' >/run/mtp2026/settings.state");
    else if(id==2)run_background("ifconfig eth0 up 2>/dev/null || true; udhcpc -q -n -i eth0 >/run/mtp2026/network-action.log 2>&1 || true");
    else if(id==4)run_background("printf 'notifications=enabled\\n' >/run/mtp2026/settings.state");
    else if(id==5)launch_browser("https://vexaaccount-management.onrender.com/");
    else if(id==6)run_background("df -h >/run/mtp2026/storage.state");
    else if(id==7)page=7;
    return;
  }
  if(page==4){
    if(id==0)run_background("ifconfig eth0 up 2>/dev/null || true; udhcpc -q -n -i eth0 >/run/mtp2026/network-action.log 2>&1 || true");
    else if(pointer_y>295)launch_browser("https://vexaaccount-management.onrender.com/");
    return;
  }
  if(page==5){run_background("printf 'acknowledged=%s\\n' \"$(date -u +%FT%TZ)\" >/run/mtp2026/notifications.state");return;}
  if(page==6){if(id==0)launch_browser("https://vexaaccount-management.onrender.com/");else if(id==1)launch_browser("https://mtp2026-app-launcher.onrender.com/");return;}
  if(page==7){
    if(id==0)run_background("reboot -f");
    else if(id==1)run_background("poweroff -f");
    else if(id==2)run_background("sync");
    else page=0;
  }
}
static void input_loop(void){
  DIR*d=opendir("/dev/input"); if(!d)return;
  char path[256]; struct dirent*e; int fds[32],n=0;
  while((e=readdir(d))&&n<32){
    if(strncmp(e->d_name,"event",5))continue;
    snprintf(path,sizeof(path),"/dev/input/%s",e->d_name);
    int fd=open(path,O_RDONLY|O_NONBLOCK); if(fd>=0)fds[n++]=fd;
  }
  closedir(d); struct input_event ev;
  while(running){
    if(strcmp(profile,"desktop")==0 && desktop_view==0 && time(NULL)-boot_time<3){draw_splash();usleep(150000);continue;}
    for(int i=0;i<n;i++)while(read(fds[i],&ev,sizeof(ev))==(ssize_t)sizeof(ev)){
      if(ev.type==EV_ABS){
        if(ev.code==ABS_X||ev.code==ABS_MT_POSITION_X)pointer_x=(int)((long long)ev.value*fb.w/32767);
        else if(ev.code==ABS_Y||ev.code==ABS_MT_POSITION_Y)pointer_y=(int)((long long)ev.value*fb.h/32767);
      }
      if(ev.type==EV_KEY && ev.value==1){
        if(strcmp(profile,"desktop")==0){
          if(desktop_view==0){if(ev.code==KEY_ENTER||ev.code==KEY_SPACE||ev.code==BTN_A||ev.code==BTN_LEFT){desktop_view=1;cursor=0;draw();}continue;}
          if(ev.code==KEY_ESC){desktop_view=1;cursor=0;draw();continue;}
          if(ev.code==KEY_LEFT||ev.code==KEY_UP){cursor=(cursor+((desktop_view==2)?7:((desktop_view==3)?7:8)))%((desktop_view==2)?8:((desktop_view==3)?8:9));draw();continue;}
          if(ev.code==KEY_RIGHT||ev.code==KEY_DOWN){cursor=(cursor+1)%((desktop_view==2)?8:((desktop_view==3)?8:9));draw();continue;}
          if(ev.code==KEY_ENTER||ev.code==KEY_SPACE||ev.code==BTN_A){desktop_action(cursor);draw();continue;}
          if(ev.code==BTN_LEFT){
            int ty=fb.h-64;
            if(pointer_y>=ty){int cx=fb.w/2;
              if(pointer_x>=cx-155&&pointer_x<cx-113){desktop_view=2;cursor=0;draw();continue;}
              if(pointer_x>=cx-105&&pointer_x<cx-63){launch_url("https://www.vexastore.2bd.net/");continue;}
              if(pointer_x>=cx-55&&pointer_x<cx-13){desktop_view=3;cursor=0;draw();continue;}
              if(pointer_x>=cx-5&&pointer_x<cx+37){launch_url(NULL);continue;}
            }
            if(desktop_view==1&&pointer_x<115&&pointer_y>=72&&pointer_y<520){
              int idx=(pointer_y-72)/90;if(idx==0)desktop_view=3;else if(idx==1)launch_url("https://www.vexastore.2bd.net/");else if(idx==2)launch_url(NULL);else if(idx==3)desktop_view=3;draw();
            } else if(desktop_view==2&&pointer_x>0){
              int x=(fb.w-620)/2,y=fb.h-64-470-20;
              if(pointer_x>=x+30&&pointer_x<x+590&&pointer_y>=y+160&&pointer_y<y+344){int col=(pointer_x-x-30)/140,row=(pointer_y-y-160)/92;cursor=row*4+col;desktop_action(cursor);draw();}
            }
          }
          continue;
        }
        if(ev.code==KEY_ESC){page=0;cursor=0;draw();continue;}
        if(ev.code==KEY_RIGHT||ev.code==KEY_DOWN){cursor=(cursor+1)%8;draw();continue;}
        if(ev.code==KEY_LEFT||ev.code==KEY_UP){cursor=(cursor+7)%8;draw();continue;}
        if(ev.code==KEY_ENTER||ev.code==KEY_SPACE||ev.code==BTN_A){
          if(page==0){page=(cursor%7)+1;cursor=0;}
          else guest_action(cursor);
          draw();continue;
        }
        if(ev.code==BTN_LEFT){
          int np=page_from_touch(); if(np>=0){page=np;cursor=0;draw();continue;}
          int id=button_from_touch(page); if(id>=0){cursor=id;guest_action(id);draw();continue;}
          if(page==0){
            int col=pointer_x<fb.w/2?0:1,row=(pointer_y-250)/82;
            if(pointer_y>=250&&row>=0&&row<3){int id=row*2+col;page=(id==0)?1:(id==1)?1:(id==2)?2:(id==3)?3:(id==4)?5:7;cursor=0;draw();}
          } else if(page==4 && pointer_y>=235&&pointer_y<293){guest_action(0);draw();}
          else if(page==6 && pointer_y>=235&&pointer_y<300){launch_browser("https://vexaaccount-management.onrender.com/");}
          else if(page==7){int id=(pointer_y-135)/80;if(id>=0&&id<4){guest_action(id);draw();}}
        }
      }
    }
    usleep(12000);
  }
  for(int i=0;i<n;i++)close(fds[i]);
}
int main(void){
  profile=getenv("MTP2026_PROFILE")?getenv("MTP2026_PROFILE"):"mtp2026";
  profile_name=getenv("MTP2026_PROFILE_NAME")?getenv("MTP2026_PROFILE_NAME"):"MTP2026 Guest OS";
  printf("MTP2026 GUI READY profile=%s architecture=arm64\\n",profile);fflush(stdout);
  open_fb();if(!fb.mem){fprintf(stderr,"MTP2026 GUI framebuffer unavailable; continuing in service mode\\n");return 0;}
  boot_time=time(NULL);draw();input_loop();if(browser_pid>0)kill(browser_pid,SIGTERM);close_fb();return 0;
}
