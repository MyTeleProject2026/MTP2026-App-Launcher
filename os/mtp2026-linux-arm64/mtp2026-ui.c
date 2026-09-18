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
#include <unistd.h>
#include <dirent.h>

typedef struct { int fd; int w,h,bpp,stride; uint8_t *mem; size_t len; } FB;
static FB fb={0};
static int page=0, cursor=0, running=1, pointer_x=0, pointer_y=0;
static const char *profile="MTP2026";
static const char *profile_name="MTP2026 Guest OS";
static const char *pages[]={"Home","Apps","Files","Settings","Network","Notifications","Account","Power"};
static const int page_count=8;

static uint32_t rgb(uint8_t r,uint8_t g,uint8_t b){return (uint32_t)r<<16|(uint32_t)g<<8|b;}
static void pixel(int x,int y,uint32_t c){
  if(!fb.mem||x<0||y<0||x>=fb.w||y>=fb.h)return;
  uint8_t *p=fb.mem+y*fb.stride+x*(fb.bpp/8);
  if(fb.bpp==32){*(uint32_t*)p=0xff000000u|c;}
  else if(fb.bpp==16){uint16_t v=((c>>19)<<11)|(((c>>10)&63)<<5)|((c>>3)&31);*(uint16_t*)p=v;}
}
static void rect(int x,int y,int w,int h,uint32_t c){for(int yy=y;yy<y+h;yy++)for(int xx=x;xx<x+w;xx++)pixel(xx,yy,c);}
static const uint8_t font[38][7]={
{0x0e,0x11,0x11,0x1f,0x11,0x11,0x11},{0x1e,0x11,0x11,0x1e,0x11,0x11,0x1e},{0x0e,0x11,0x10,0x10,0x10,0x11,0x0e},
{0x1e,0x11,0x11,0x11,0x11,0x11,0x1e},{0x1f,0x10,0x10,0x1e,0x10,0x10,0x1f},{0x1f,0x10,0x10,0x1e,0x10,0x10,0x10},
{0x0e,0x11,0x10,0x17,0x11,0x11,0x0f},{0x11,0x11,0x11,0x1f,0x11,0x11,0x11},{0x1f,0x04,0x04,0x04,0x04,0x04,0x1f},
{0x01,0x01,0x01,0x01,0x11,0x11,0x0e},{0x11,0x12,0x14,0x18,0x14,0x12,0x11},{0x10,0x10,0x10,0x10,0x10,0x10,0x1f},
{0x11,0x1b,0x15,0x15,0x11,0x11,0x11},{0x11,0x19,0x15,0x13,0x11,0x11,0x11},{0x0e,0x11,0x11,0x11,0x11,0x11,0x0e},
{0x1e,0x11,0x11,0x1e,0x10,0x10,0x10},{0x0e,0x11,0x11,0x11,0x15,0x12,0x0d},{0x1e,0x11,0x11,0x1e,0x14,0x12,0x11},
{0x0f,0x10,0x10,0x0e,0x01,0x01,0x1e},{0x1f,0x04,0x04,0x04,0x04,0x04,0x04},{0x11,0x11,0x11,0x11,0x11,0x11,0x0e},
{0x11,0x11,0x11,0x11,0x11,0x0a,0x04},{0x11,0x11,0x11,0x15,0x15,0x1b,0x11},{0x11,0x11,0x0a,0x04,0x0a,0x11,0x11},
{0x11,0x11,0x0a,0x04,0x04,0x04,0x04},{0x1f,0x01,0x02,0x04,0x08,0x10,0x1f},
{0,0,0,0,0,0,0},{0x0e,0x11,0x13,0x15,0x19,0x11,0x0e},{0x1e,0x11,0x11,0x1e,0x11,0x11,0x1e},
{0x0e,0x10,0x10,0x10,0x10,0x10,0x0e},{0x1e,0x11,0x11,0x11,0x11,0x11,0x1e},
{0x1f,0x10,0x10,0x1e,0x10,0x10,0x1f},{0x0e,0x11,0x10,0x17,0x11,0x11,0x0f},
{0x11,0x11,0x11,0x1f,0x11,0x11,0x11},{0x1f,0x04,0x04,0x04,0x04,0x04,0x1f},
{0x01,0x01,0x01,0x01,0x11,0x11,0x0e},{0x11,0x12,0x14,0x18,0x14,0x12,0x11}};
static int glyph(char c){if(c>='a'&&c<='z')c=(char)(c-'a'+'A'); if(c>='A'&&c<='Z')return c-'A'; if(c==' ')return 26; return -1;}
static void text(int x,int y,const char*s,int scale,uint32_t c){
 for(;*s;s++,x+=6*scale){int g=glyph(*s);if(g<0)continue;for(int yy=0;yy<7;yy++)for(int xx=0;xx<5;xx++)if(font[g][yy]&(1<<(4-xx)))rect(x+xx*scale,y+yy*scale,scale,scale,c);}
}
static void draw(){
 if(!fb.mem)return;
 rect(0,0,fb.w,fb.h,rgb(5,10,20));
 int top=56; rect(0,0,fb.w,top,rgb(9,24,43));
 text(22,18,"MTP2026",4,rgb(90,220,255));
 char title[96];snprintf(title,sizeof(title),"%s  |  ARM64",profile_name);text(250,23,title,2,rgb(220,232,245));
 int side=190;rect(0,top,side,fb.h-top,rgb(8,18,31));
 for(int i=0;i<page_count;i++){int y=top+10+i*58;uint32_t c=i==page?rgb(25,70,105):rgb(13,31,50);rect(10,y,side-20,48,c);text(25,y+17,pages[i],2,rgb(225,235,246));}
 int x=side+25,w=fb.w-side-50;
 if(page==0){text(x,top+25,"HOME",4,rgb(90,220,255));text(x,top+80,"MTP2026 GUEST SYSTEM",3,rgb(230,240,250));text(x,top+120,"VEXAACCOUNT   VEXASTORE",2,rgb(150,175,200));}
 else if(page==1){text(x,top+25,"APPS",4,rgb(90,220,255));const char*a[]={"VexaStore","WebApps","File Manager","Settings","Browser","Game Hub"};for(int i=0;i<6;i++){int bx=x+(i%3)*220,by=top+80+(i/3)*95;rect(bx,by,195,72,rgb(14,32,52));text(bx+15,by+28,a[i],2,rgb(230,240,250));}}
 else if(page==2){text(x,top+25,"FILES",4,rgb(90,220,255));const char*a[]={"Desktop","Documents","Downloads","Pictures","Music","Games","Apps","Device Storage"};for(int i=0;i<8;i++){int bx=x+(i%4)*170,by=top+80+(i/4)*90;rect(bx,by,150,68,rgb(14,32,52));text(bx+10,by+26,a[i],2,rgb(230,240,250));}}
 else if(page==3){text(x,top+25,"SETTINGS",4,rgb(90,220,255));const char*a[]={"Display","Sound","Notifications","Network","Storage","Account","Device OS","Power"};for(int i=0;i<8;i++){int bx=x+(i%4)*170,by=top+80+(i/4)*90;rect(bx,by,150,68,rgb(14,32,52));text(bx+10,by+26,a[i],2,rgb(230,240,250));}}
 else {char b[128];snprintf(b,sizeof(b),"%s",pages[page]);text(x,top+25,b,4,rgb(90,220,255));text(x,top+90,"SERVICE ACTIVE",3,rgb(220,235,245));text(x,top+135,"MTP2026 SYSTEM SERVICE",2,rgb(145,170,195));}
 rect(0,fb.h-34,fb.w,34,rgb(9,24,43));text(18,fb.h-25,"READY",2,rgb(120,230,170));text(fb.w-260,fb.h-25,"QEMU ARM64 GUEST",2,rgb(145,170,195));
}
static void select_next(int d){page=(page+d+page_count)%page_count;draw();}
static void input_loop(){
 DIR*d=opendir("/dev/input");if(!d)return;char path[256];struct dirent*e;int fds[16],n=0;
 while((e=readdir(d))&&n<16){if(strncmp(e->d_name,"event",5)!=0)continue;snprintf(path,sizeof(path),"/dev/input/%s",e->d_name);int fd=open(path,O_RDONLY|O_NONBLOCK);if(fd>=0)fds[n++]=fd;}closedir(d);
 struct input_event ev;for(;;){if(!running)break;for(int i=0;i<n;i++){while(read(fds[i],&ev,sizeof(ev))==(ssize_t)sizeof(ev)){if(ev.type==EV_ABS){if(ev.code==ABS_X)pointer_x=(int)((long long)ev.value*fb.w/32767);else if(ev.code==ABS_Y)pointer_y=(int)((long long)ev.value*fb.h/32767);}
if(ev.type==EV_KEY&&ev.value==1){if(ev.code==KEY_RIGHT||ev.code==KEY_DOWN||ev.code==BTN_A)select_next(1);else if(ev.code==KEY_LEFT||ev.code==KEY_UP||ev.code==BTN_B)select_next(-1);else if(ev.code==KEY_ENTER||ev.code==KEY_SPACE){page=cursor;draw();}else if(ev.code==BTN_LEFT){int p=(pointer_y-66)/58;if(pointer_x<190&&p>=0&&p<page_count){page=p;draw();}}else if(ev.code==KEY_ESC){page=0;draw();}}}}usleep(12000);}
 for(int i=0;i<n;i++)close(fds[i]);
}
int main(void){
 profile=getenv("MTP2026_PROFILE")?: "mtp2026";profile_name=getenv("MTP2026_PROFILE_NAME")?: "MTP2026 Guest OS";
 printf("MTP2026 GUI READY profile=%s architecture=arm64\n",profile);fflush(stdout);
 fb.fd=open("/dev/fb0",O_RDWR);
 if(fb.fd>=0){struct fb_var_screeninfo v;struct fb_fix_screeninfo f;if(ioctl(fb.fd,FBIOGET_VSCREENINFO,&v)==0&&ioctl(fb.fd,FBIOGET_FSCREENINFO,&f)==0){fb.w=v.xres;fb.h=v.yres;fb.bpp=v.bits_per_pixel;fb.stride=f.line_length;fb.len=(size_t)fb.stride*fb.h;fb.mem=mmap(NULL,fb.len,PROT_READ|PROT_WRITE,MAP_SHARED,fb.fd,0);if(fb.mem==MAP_FAILED)fb.mem=NULL;}}
 if(!fb.mem){fprintf(stderr,"MTP2026 GUI framebuffer unavailable; continuing in service mode\n");return 0;}
 draw();input_loop();return 0;
}
