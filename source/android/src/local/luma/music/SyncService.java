package local.luma.music;

import android.app.*;
import android.os.*;
import android.content.*;
import android.net.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

public class SyncService extends Service {
  public static volatile boolean running=false,cancelled=false;
  public static volatile String connectionState="idle";
  private static final String CHANNEL="sync";
  public IBinder onBind(Intent i){return null;}
  public void onCreate(){super.onCreate();getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,"Передача музыки",NotificationManager.IMPORTANCE_LOW));}
  private Notification notification(String text){return new Notification.Builder(this,CHANNEL).setSmallIcon(local.luma.music.R.drawable.ic_status_music).setContentTitle("Tembrival • Wi-Fi").setContentText(text).setOngoing(true).setContentIntent(PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE)).addAction(new Notification.Action.Builder(null,"Отменить",PendingIntent.getService(this,3,new Intent(this,SyncService.class).setAction("cancel"),PendingIntent.FLAG_IMMUTABLE)).build()).build();}
  private void progress(String s){Store.syncStatus=s;getSystemService(NotificationManager.class).notify(2,notification(s));}
  public int onStartCommand(Intent intent,int flags,int startId){
    if(intent==null){stopSelf();return START_NOT_STICKY;}
    if("cancel".equals(intent.getAction())){cancelled=true;SyncConnection.cancel();return START_NOT_STICKY;}
    if(running)return START_NOT_STICKY;running=true;cancelled=false;Store.error="";
    SyncPresence.refresh(this);startForeground(2,notification("Подключение к компьютеру…"));
    new Thread(()->{
      PowerManager.WakeLock wake=getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"luma:sync");wake.acquire(6*60*60*1000L);
      try{
        if("discover".equals(intent.getAction())){connectionState="searching";progress("Ищем Tembrival на ПК в локальной сети…");JSONArray list=SyncConnection.discover(this);Store.syncStatus=list.length()>0?"Найдено адресов ПК: "+list.length()+". Выберите свой компьютер.":"ПК не найден. Проверьте общую сеть, точку доступа и разрешение локальной сети в VPN.";}
        else if("pair".equals(intent.getAction()))pair(intent.getStringExtra("server"),intent.getStringExtra("pin"),intent.getStringExtra("fingerprint"));
        else if("replace".equals(intent.getAction()))AudioReplacement.replace(this,intent.getStringExtra("id"),intent.getStringExtra("uri"));
        else if("import".equals(intent.getAction()))NativeLibrary.importUris(this,intent.getStringArrayListExtra("uris"),intent.getBooleanExtra("skipSimilar",true),this::progress);
        else{
          int attempt=0;while(true){check();try{connectionState="connecting";progress(attempt==0?"Проверяем соединение с ПК…":"Ищем знакомый ПК и восстанавливаем передачу…");SyncConnection.reconnect(this);connectionState="transferring";
            if("upload".equals(intent.getAction()))upload();
            else if("syncPlaylists".equals(intent.getAction())){exchangePlaylists();Store.syncStatus="Плейлисты, обложки и избранное синхронизированы.";}
            else if("update".equals(intent.getAction()))downloadUpdate();
            else if("connect".equals(intent.getAction()))Store.syncStatus="ПК доступен. Можно передавать музыку.";
            else sync();break;
          }catch(Exception e){check();if(!retryable(e))throw e;connectionState="waiting";int delay=new int[]{2,5,10,20,30}[Math.min(attempt++,4)];progress("Соединение прервано. Повтор через "+delay+" с. Держите Tembrival на ПК открытой; проверьте Wi-Fi, точку доступа и VPN. Отмена доступна.");for(int n=0;n<delay*5;n++){check();Thread.sleep(200);}}
          }
        }
      }catch(Exception e){Store.error=e.getMessage()==null?e.toString():e.getMessage();Store.syncStatus="Передача остановлена: "+Store.error;}
      finally{connectionState="idle";new Handler(Looper.getMainLooper()).post(()->{if(PlaybackService.instance!=null)PlaybackService.instance.refreshFromStore();});if(wake.isHeld())wake.release();running=false;SyncPresence.refresh(this);stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
    },"LumaSync").start();return START_NOT_STICKY;
  }
  private boolean retryable(Exception e){if(e instanceof SyncConnection.Rejected)return false;if(e instanceof SyncConnection.Missing||e instanceof SocketTimeoutException||e instanceof SocketException||e instanceof UnknownHostException||e instanceof EOFException)return true;String message=String.valueOf(e.getMessage());return message.matches("(?is).*(Передача прервана|connection.*(reset|closed|refused|abort)|network.*(unreachable|down)|timed out|Ошибка (ПК|передачи): 5[0-9][0-9]).*");}
  public static String validateServer(String input)throws Exception{
    String s=input.trim();if(!s.contains("://"))s="https://"+s;
    URI uri=new URI(s);String h=uri.getHost();
    if(!"https".equals(uri.getScheme())||h==null||uri.getRawUserInfo()!=null||uri.getRawQuery()!=null||uri.getRawFragment()!=null||!(uri.getPath().isEmpty()||uri.getPath().equals("/")))throw new IOException("Введите локальный адрес ПК, например https://192.168.1.10:47832");
    if(!h.matches("[0-9.]+"))throw new IOException("Нужен IPv4-адрес из приложения на ПК");
    InetAddress ip=InetAddress.getByName(h);if(!(ip.isSiteLocalAddress()||ip.isLinkLocalAddress()))throw new IOException("Нужен адрес ПК в локальной сети Wi-Fi");
    int port=uri.getPort()==-1?47832:uri.getPort();if(port<1||port>65535)throw new IOException("Неверный порт");return "https://"+h+":"+port;
  }
  private HttpURLConnection open(String server,String route,String token)throws Exception{
    return SyncConnection.open(this,server,route,token);
  }
  private JSONObject readJson(HttpURLConnection h)throws Exception{
    int status=h.getResponseCode();if(status!=200){String msg="Ошибка ПК: "+status;try(InputStream in=h.getErrorStream()){if(in!=null){byte[] b=new byte[16384];int n=in.read(b);if(n>0)msg=new JSONObject(new String(b,0,n,StandardCharsets.UTF_8)).optString("error",msg);}}catch(Exception ignored){}finally{h.disconnect();}if(status==401)msg="Доступ отключён. Подключите телефон заново по коду.";throw new IOException(msg);}
    ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream in=h.getInputStream()){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1){check();bytes.write(b,0,n);if(bytes.size()>32*1024*1024)throw new IOException("Слишком большая библиотека");}}finally{h.disconnect();}
    try{return new JSONObject(bytes.toString("UTF-8"));}catch(JSONException e){throw new EOFException("Передача прервана при получении списка. Восстанавливаем соединение.");}
  }
  private void pair(String server,String pin,String fingerprint)throws Exception{
    progress("Проверяем код…");server=validateServer(server);HttpURLConnection h=SyncConnection.openPinned(this,server,"/v1/pair",null,fingerprint,false);h.setRequestMethod("POST");h.setDoOutput(true);h.setRequestProperty("Content-Type","application/json");
    JSONObject body=new JSONObject().put("pin",pin).put("name",Build.MANUFACTURER+" "+Build.MODEL).put("installationId",ConnectionSecrets.installationId(this));
    JSONObject old=Store.connection(this);if(fingerprint.equals(old.optString("fingerprint"))&&old.has("token"))body.put("previousDeviceId",old.optString("deviceId")).put("previousToken",old.getString("token"));
    byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);h.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=h.getOutputStream()){out.write(bytes);}
    JSONObject data=readJson(h);data.put("server",server).put("fingerprint",fingerprint);ConnectionSecrets.save(this,data);Store.revision++;Store.syncStatus="ПК подключён. Нажмите «Сохранить всю музыку на телефон».";
  }
  private void check()throws IOException{if(cancelled)throw new IOException("Отменено. При следующем запуске передача продолжится.");}
  private void exchangePlaylists()throws Exception{check();JSONObject c=Store.connection(this);JSONObject reply=post(validateServer(c.getString("server")),"/v1/playlists",c.getString("token"),new JSONObject().put("records",PlaylistStore.load(this)));PlaylistStore.save(this,reply.getJSONArray("records"));exchangeReplacements();exchangeFavorites();exchangeCollections();}
  private void exchangeCollections()throws Exception{check();JSONObject c=Store.connection(this);HttpURLConnection h=open(validateServer(c.getString("server")),"/v1/collections",c.getString("token"));h.setRequestMethod("POST");h.setDoOutput(true);h.setRequestProperty("Content-Type","application/json");byte[] bytes=new JSONObject().put("records",CollectionStore.load(this)).toString().getBytes(StandardCharsets.UTF_8);h.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=h.getOutputStream()){out.write(bytes);}int code=h.getResponseCode();if(code==404||code==405){h.disconnect();return;}CollectionStore.merge(this,readJson(h).getJSONArray("records"));}
  private void exchangeFavorites()throws Exception{check();JSONObject c=Store.connection(this);HttpURLConnection h=open(validateServer(c.getString("server")),"/v1/favorites",c.getString("token"));h.setRequestMethod("POST");h.setDoOutput(true);h.setRequestProperty("Content-Type","application/json");byte[] bytes=new JSONObject().put("records",FavoriteStore.load(this)).toString().getBytes(StandardCharsets.UTF_8);h.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=h.getOutputStream()){out.write(bytes);}int code=h.getResponseCode();if(code==404||code==405){h.disconnect();return;}FavoriteStore.save(this,readJson(h).getJSONArray("records"));}
  private void exchangeReplacements()throws Exception{JSONObject c=Store.connection(this),map=Store.load(this).optJSONObject("replacements");if(map==null)map=new JSONObject();HttpURLConnection h=open(validateServer(c.getString("server")),"/v1/replacements",c.getString("token"));h.setRequestMethod("POST");h.setDoOutput(true);h.setRequestProperty("Content-Type","application/json");byte[] bytes=new JSONObject().put("replacements",map).toString().getBytes(StandardCharsets.UTF_8);h.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=h.getOutputStream()){out.write(bytes);}int code=h.getResponseCode();if(code==404||code==405){h.disconnect();return;}JSONObject reply=readJson(h);Store.mergeReplacements(this,reply.getJSONObject("replacements"));}
  private void sync()throws Exception{
    exchangePlaylists();
    JSONObject c=Store.connection(this);String server=validateServer(c.getString("server")),token=c.getString("token");progress("Получаем список музыки…");
    JSONArray remote=readJson(open(server,"/v1/manifest",token)).getJSONArray("tracks");
    JSONObject library=Store.load(this);JSONArray tracks=library.getJSONArray("tracks");Set<String> have=new HashSet<>();for(int i=0;i<tracks.length();i++)have.add(tracks.getJSONObject(i).getString("id"));
    File artDir=new File(getFilesDir(),"art");artDir.mkdirs();int added=0;
    for(int i=0;i<remote.length();i++){
      check();JSONObject t=remote.getJSONObject(i);String id=t.getString("id");File target=Store.audio(this,t);long size=t.getLong("size");if(size<1)throw new IOException("Некорректный размер трека");
      if(Store.ignored(this,id))continue;
      if(!target.exists()||target.length()!=size){
        progress((i+1)+" / "+remote.length()+" • "+t.getString("title"));
        download(server,"/v1/audio/"+id,token,target,size,id,(i+1)+" / "+remote.length()+" • "+t.getString("title"));added++;
      }
      if(t.optBoolean("cover")&&!new File(artDir,id).exists()){
        try{download(server,"/v1/art/"+id,token,new File(artDir,id),-1,null,"");}catch(Exception e){check();t.put("cover",false);}
      }
      if(!have.contains(id)){tracks.put(t);have.add(id);Store.append(this,t,false);}else if(t.optLong("detailsUpdatedAt")>0)TrackDetails.update(this,id,t,true);
    }
    exchangePlaylists();Store.syncStatus="Готово. Треков на телефоне: "+tracks.length()+". Скопировано сейчас: "+added+". Можно слушать без ПК и Wi-Fi.";Store.revision++;
  }
  private JSONObject post(String server,String route,String token,JSONObject body)throws Exception{
    HttpURLConnection h=open(server,route,token);h.setRequestMethod("POST");h.setDoOutput(true);h.setRequestProperty("Content-Type","application/json");byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);h.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=h.getOutputStream()){out.write(bytes);}return readJson(h);
  }
  private void upload()throws Exception{
    exchangePlaylists();
    JSONObject connection=Store.connection(this);String server=validateServer(connection.getString("server")),token=connection.getString("token");JSONArray tracks=Store.load(this).getJSONArray("tracks");int added=0,skipped=0;
    for(int i=0;i<tracks.length();i++){
      check();JSONObject t=tracks.getJSONObject(i);String id=t.getString("id");File file=Store.audio(this,t);
      progress("На ПК "+(i+1)+" / "+tracks.length()+" • "+t.getString("title"));
      JSONObject start=post(server,"/v1/upload/start",token,new JSONObject().put("track",t));
      if(start.optBoolean("exists")||start.optBoolean("ignored")){skipped++;continue;}
      long offset=start.getLong("offset");if(offset<0||offset>file.length())throw new IOException("Неверное смещение передачи");
      try(RandomAccessFile input=new RandomAccessFile(file,"r")){
        input.seek(offset);byte[] buffer=new byte[2*1024*1024];int n;
        while((n=input.read(buffer))!=-1){check();HttpURLConnection h=open(server,"/v1/upload/"+id,token);h.setRequestMethod("PUT");h.setDoOutput(true);h.setRequestProperty("X-Offset",String.valueOf(offset));h.setRequestProperty("Content-Type","application/octet-stream");h.setFixedLengthStreamingMode(n);try(OutputStream out=h.getOutputStream()){out.write(buffer,0,n);}JSONObject result=readJson(h);if(result.getLong("offset")!=offset+n)throw new IOException("Смещение передачи изменилось");offset+=n;progress("На ПК "+(i+1)+" / "+tracks.length()+" • "+t.getString("title")+" • "+offset*100/file.length()+"%");}
      }
      JSONObject result=post(server,"/v1/upload/"+id+"/finish",token,new JSONObject());added+=result.optInt("added");
    }
    exchangePlaylists();Store.syncStatus="Готово. Добавлено на ПК: "+added+". Уже есть или удалено ранее: "+skipped+".";Store.revision++;
  }
  private void downloadUpdate()throws Exception{
    JSONObject c=Store.connection(this);String server=validateServer(c.getString("server")),token=c.getString("token");progress("Проверяем обновление на ПК…");JSONObject info=readJson(open(server,"/v1/update",token));
    android.content.pm.PackageInfo installed=getPackageManager().getPackageInfo(getPackageName(),0);long installedCode=Build.VERSION.SDK_INT>=28?installed.getLongVersionCode():installed.versionCode;
    if(info.getLong("versionCode")<=installedCode){Store.syncStatus="Установлена актуальная версия "+installed.versionName+". На ПК: "+info.optString("version")+".";Store.revision++;return;}
    String hash=info.getString("sha256");long size=info.getLong("size");if(!hash.matches("[a-f0-9]{64}")||size<1||size>500*1024*1024)throw new IOException("Некорректное обновление");
    File dir=new File(getFilesDir(),"updates");dir.mkdirs();File marker=new File(dir,"hash"),apk=new File(dir,"Luma.apk");String old=marker.exists()?new String(Files.readAllBytes(marker.toPath()),StandardCharsets.UTF_8):"";if(!old.equals(hash)){new File(apk.getPath()+".part").delete();Files.write(marker.toPath(),hash.getBytes(StandardCharsets.UTF_8));}
    download(server,"/Luma-Music-Android.apk",token,apk,size,hash,"Обновление "+info.getString("version"));
    try{UpdateTrust.verify(this,apk);}catch(Exception e){apk.delete();Store.revision++;throw e;}
    Store.syncStatus="Обновление "+info.getString("version")+" скачано. Нажмите «Установить обновление» и подтвердите установку в Android.";Store.revision++;
  }
  private void download(String server,String route,String token,File target,long expected,String hash,String label)throws Exception{
    File part=new File(target.getPath()+".part");long offset=part.exists()?part.length():0;
    if(expected>0&&offset>expected){part.delete();offset=0;}
    long required=expected>0?expected-offset:2*1024*1024;if(target.getParentFile().getUsableSpace()<required+10*1024*1024)throw new IOException("На телефоне недостаточно свободной памяти");
    if(expected<0||offset!=expected){
      HttpURLConnection h=open(server,route,token);if(offset>0)h.setRequestProperty("Range","bytes="+offset+"-");
      try{
        int code=h.getResponseCode();if(code!=200&&code!=206)throw new IOException(code==401?"Нужно подключить ПК заново":"Ошибка передачи: "+code);
        if(code==200)offset=0;
        if(code==206&&!h.getHeaderField("Content-Range").startsWith("bytes "+offset+"-"))throw new IOException("Неверное смещение передачи");
        long received=offset,last=0;try(InputStream in=h.getInputStream();FileOutputStream out=new FileOutputStream(part,offset>0)){
          byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1){check();out.write(buffer,0,n);received+=n;if(expected>0&&received>expected)throw new IOException("Размер трека отличается от библиотеки");if(expected<0&&received>20*1024*1024)throw new IOException("Слишком большая обложка");if(expected>0&&System.currentTimeMillis()-last>700){progress(label+" • "+(received*100/expected)+"%");last=System.currentTimeMillis();}}out.getFD().sync();
        }
      }finally{h.disconnect();}
    }
    check();if(expected>0&&part.length()!=expected)throw new IOException("Передача прервана. Запустите синхронизацию ещё раз.");
    if(hash!=null){MessageDigest digest=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(part)){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1){check();digest.update(b,0,n);}}StringBuilder got=new StringBuilder();for(byte b:digest.digest())got.append(String.format("%02x",b&255));if(!got.toString().equals(hash)){part.delete();throw new IOException("Файл не прошёл проверку. Повторите синхронизацию.");}}
    Files.move(part.toPath(),target.toPath(),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);
  }
  @Override public void onTimeout(int startId,int fgsType){cancelled=true;SyncConnection.cancel();Store.syncStatus="Android ограничил длительность передачи. Запустите её снова для продолжения.";stopSelf();}
}
