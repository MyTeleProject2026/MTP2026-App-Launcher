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
static int page=0, cursor=0, running=1, pointer_x=0, pointer_y=0;
static int browser_pid=0;
static const char *profile="mtp2026", *profile_name="MTP2026 Guest OS";
static const char *pages[]={"Home","Apps","Files","Settings","Network","Notifications","Account","Power"};
static const int page_count=8;

static uint32_t rgb(uint8_t r,uint8_t g,uint8_t b){return ((uint32_t)r<<16)|((uint32_t)g<<8)|b;}
static void pixel(int x,int y,uint32_t c){
  if(!fb.mem||x<0||y<0||x>=fb.w||y>=fb.h)return;
  uint8_t *p=fb.mem+y*fb.stride+x*(fb.bpp/8);
  if(fb.bpp==32)*(uint32_t*)p=0xff000000u|c;
  else if(fb.bpp==16)*(uint16_t*)p=(uint16_t)(((c>>19)<<11)|(((c>>10)&63)<<5)|((c>>3)&31));
}
static void rect(int x,int y,int w,int h,uint32_t c){for(int yy=y;yy<y+h;yy++)for(int xx=x;xx<x+w;xx++)pixel(xx,yy,c);}
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
static void action(const char *cmd){
  pid_t p=fork();if(p==0){execl("/bin/sh","sh","-c",cmd,(char*)NULL);_exit(127);}
  if(p>0)waitpid(p,NULL,0);
}
static void launch_url(const char *url){
  if(browser_pid>0){kill(browser_pid,SIGTERM);waitpid(browser_pid,NULL,0);browser_pid=0;}
  const char *safe=url&&strncmp(url,"https://",8)==0?url:"https://vexaaccount-management.onrender.com";
  browser_pid=fork();
  if(browser_pid==0){execl("/usr/bin/mtp2026-browser","mtp2026-browser",safe,(char*)NULL);_exit(127);}
}
static void service_toggle(const char *service){
  char cmd[160];snprintf(cmd,sizeof(cmd),"/usr/bin/mtp2026-service restart %s >/run/mtp2026/ui-action.log 2>&1",service);action(cmd);
}
static void draw(void){
  if(!fb.mem)return;
  rect(0,0,fb.w,fb.h,rgb(5,10,20));int top=56,side=190;
  rect(0,0,fb.w,top,rgb(9,24,43));text(22,18,"MTP2026",4,rgb(90,220,255));
  text(250,23,profile_name,2,rgb(220,232,245));
  rect(0,top,side,fb.h-top,rgb(8,18,31));
  for(int i=0;i<page_count;i++){int y=top+10+i*58;rect(10,y,side-20,48,i==page?rgb(25,70,105):rgb(13,31,50));text(25,y+17,pages[i],2,rgb(225,235,246));}
  int x=side+25;char line[160];
  if(page==0){
    text(x,top+25,"HOME",4,rgb(90,220,255));text(x,top+80,"MTP2026 GUEST SYSTEM",3,rgb(230,240,250));
    text(x,top+125,"VEXAACCOUNT VEXASTORE",2,rgb(150,175,200));
    text(x,top+175,"ENTER APPS TO OPEN",2,rgb(120,230,170));
  } else if(page==1){
    text(x,top+25,"APPS",4,rgb(90,220,255));
    const char *a[]={"VEXASTORE","WEBAPPS","FILES","SETTINGS","BROWSER","PROFILE"};
    for(int i=0;i<6;i++){int bx=x+(i%3)*220,by=top+80+(i/3)*100;rect(bx,by,195,74,i==cursor?rgb(25,70,105):rgb(14,32,52));text(bx+15,by+29,a[i],2,rgb(230,240,250));}
    text(x,top+285,"ENTER RUNS SELECTED APP",2,rgb(120,230,170));
  } else if(page==2){
    text(x,top+25,"FILES",4,rgb(90,220,255));const char *a[]={"DESKTOP","DOCUMENTS","DOWNLOADS","PICTURES","MUSIC","GAMES","APPS","STORAGE"};
    for(int i=0;i<8;i++){int bx=x+(i%4)*170,by=top+80+(i/4)*90;rect(bx,by,150,68,i==cursor?rgb(25,70,105):rgb(14,32,52));text(bx+10,by+26,a[i],2,rgb(230,240,250));}
    snprintf(line,sizeof(line),"PERSISTENT: %s",access("/run/mtp2026/storage",F_OK)==0?"ACTIVE":"NOT ATTACHED");text(x,top+275,line,2,rgb(145,190,210));
  } else if(page==3){
    text(x,top+25,"SETTINGS",4,rgb(90,220,255));const char *a[]={"DISPLAY","SOUND","NOTIFICATIONS","NETWORK","STORAGE","ACCOUNT","DEVICE OS","POWER"};
    for(int i=0;i<8;i++){int bx=x+(i%4)*170,by=top+80+(i/4)*90;rect(bx,by,150,68,i==cursor?rgb(25,70,105):rgb(14,32,52));text(bx+10,by+26,a[i],2,rgb(230,240,250));}
    text(x,top+275,"ENTER APPLIES SELECTED SETTING",2,rgb(120,230,170));
  } else if(page==4){
    text(x,top+25,"NETWORK",4,rgb(90,220,255));text(x,top+85,"VIRTIO NETWORK",3,rgb(220,235,245));text(x,top+130,"DHCP AND INTERFACES",2,rgb(145,170,195));text(x,top+175,"ENTER REFRESHES NETWORK",2,rgb(120,230,170));
  } else if(page==5){
    text(x,top+25,"NOTIFICATIONS",4,rgb(90,220,255));text(x,top+90,"GUEST NOTIFICATION SERVICE",2,rgb(220,235,245));text(x,top+140,"ENTER ACKNOWLEDGES",2,rgb(120,230,170));
  } else if(page==6){
    text(x,top+25,"ACCOUNT",4,rgb(90,220,255));text(x,top+90,"VEXAACCOUNT IDENTITY",3,rgb(220,235,245));text(x,top+140,"SESSION OWNED BY LAUNCHER",2,rgb(145,170,195));text(x,top+190,"ENTER OPENS ACCOUNT",2,rgb(120,230,170));
  } else {
    text(x,top+25,"POWER",4,rgb(90,220,255));text(x,top+90,"REBOOT",3,rgb(220,235,245));text(x,top+145,"POWER OFF",3,rgb(220,235,245));text(x,top+205,"ENTER RUNS SELECTED ACTION",2,rgb(255,190,100));
  }
  rect(0,fb.h-34,fb.w,34,rgb(9,24,43));text(18,fb.h-25,"READY",2,rgb(120,230,170));text(fb.w-260,fb.h-25,"QEMU ARM64 GUEST",2,rgb(145,170,195));
}
static void run_selected(void){
  if(page==1){
    switch(cursor){
      case 0: launch_url("https://www.vexastore.2bd.net/");break;
      case 1: launch_url("https://mtp2026-app-launcher.onrender.com/");break;
      case 2: page=2;break;
      case 3: page=3;break;
      case 4: launch_url(NULL);break;
      case 5: page=6;break;
    }
  } else if(page==2){
    const char *dirs[]={"Desktop","Documents","Downloads","Pictures","Music","Games","Apps","."};
    char cmd[256];snprintf(cmd,sizeof(cmd),"mkdir -p /mnt/device-storage/%s >/dev/null 2>&1; ls -la /mnt/device-storage/%s > /run/mtp2026/files-action.log 2>&1",dirs[cursor%8],dirs[cursor%8]);action(cmd);
  } else if(page==3){
    const char *svc[]={"device-os","settings","notifications","webapp","store","account","device-os","device-os"};
    if(cursor==0)action("printf 'display=auto\\n' >> /run/mtp2026/settings.state");
    else if(cursor==1)action("printf 'sound=enabled\\n' >> /run/mtp2026/settings.state");
    else if(cursor==2)service_toggle("notifications");
    else if(cursor==3)action("ifconfig eth0 up 2>/dev/null || true; udhcpc -q -n -i eth0 2>/run/mtp2026/network-action.log || true");
    else if(cursor==4)action("df -h > /run/mtp2026/storage-action.log 2>&1");
    else if(cursor==5)launch_url("https://vexaaccount-management.onrender.com/");
    else if(cursor==6)service_toggle(svc[cursor]);
    else page=7;
  } else if(page==4){
    action("ifconfig eth0 up 2>/dev/null || true; udhcpc -q -n -i eth0 2>/run/mtp2026/network-action.log || true; cat /proc/net/dev > /run/mtp2026/network.state");
  } else if(page==5){
    service_toggle("notifications");action("printf '%s\\n' "ack=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> /run/mtp2026/notifications.state");
  } else if(page==6) launch_url("https://vexaaccount-management.onrender.com/");
  else if(page==7){ if(cursor%2==0) action("reboot -f"); else action("poweroff -f"); }
  draw();
}
static void select_page(int d){page=(page+d+page_count)%page_count;cursor=0;draw();}
static void input_loop(void){\n  const int top=56;
  DIR*d=opendir("/dev/input");if(!d)return;char path[256];struct dirent*e;int fds[16],n=0;
  while((e=readdir(d))&&n<16){if(strncmp(e->d_name,"event",5))continue;snprintf(path,sizeof(path),"/dev/input/%s",e->d_name);int fd=open(path,O_RDONLY|O_NONBLOCK);if(fd>=0)fds[n++]=fd;}closedir(d);
  struct input_event ev;
  while(running){for(int i=0;i<n;i++){while(read(fds[i],&ev,sizeof(ev))==(ssize_t)sizeof(ev)){
    if(ev.type==EV_ABS){if(ev.code==ABS_X)pointer_x=(int)((long long)ev.value*fb.w/32767);else if(ev.code==ABS_Y)pointer_y=(int)((long long)ev.value*fb.h/32767);}
    if(ev.type!=EV_KEY||ev.value!=1)continue;
    if(ev.code==KEY_ESC){page=0;cursor=0;draw();continue;}
    if(ev.code==KEY_RIGHT||ev.code==KEY_DOWN){if(page==1)cursor=(cursor+1)%6;else if(page==2||page==3)cursor=(cursor+1)%8;else if(page==7)cursor=(cursor+1)%2;else select_page(1);draw();continue;}
    if(ev.code==KEY_LEFT||ev.code==KEY_UP){if(page==1)cursor=(cursor+5)%6;else if(page==2||page==3)cursor=(cursor+7)%8;else if(page==7)cursor=(cursor+1)%2;else select_page(-1);draw();continue;}
    if(ev.code==KEY_ENTER||ev.code==KEY_SPACE||ev.code==BTN_A){run_selected();continue;}
    if(ev.code==BTN_LEFT){int p=(pointer_y-top-10)/58;if(pointer_x<190&&p>=0&&p<page_count){page=p;cursor=0;draw();continue;}
      if(page==1&&pointer_x>=215&&pointer_y>=136){int col=(pointer_x-215)/220,row=(pointer_y-136)/100,idx=row*3+col;if(col>=0&&col<3&&row<2&&idx<6){cursor=idx;run_selected();}}
    }
  } }usleep(12000);}
  for(int i=0;i<n;i++)close(fds[i]);
}
int main(void){
  profile=getenv("MTP2026_PROFILE")?getenv("MTP2026_PROFILE"):"mtp2026";
  profile_name=getenv("MTP2026_PROFILE_NAME")?getenv("MTP2026_PROFILE_NAME"):"MTP2026 Guest OS";
  printf("MTP2026 GUI READY profile=%s architecture=arm64\\n",profile);fflush(stdout);
  open_fb();if(!fb.mem){fprintf(stderr,"MTP2026 GUI framebuffer unavailable; continuing in service mode\\n");return 0;}
  draw();input_loop();if(browser_pid>0)kill(browser_pid,SIGTERM);close_fb();return 0;
}
