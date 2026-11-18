package local.luma.music;

import android.app.*;
import android.os.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.webkit.*;
import android.view.*;
import android.widget.FrameLayout;
import android.provider.Settings;
import java.util.ArrayList;
import org.json.*;
import java.io.*;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
  private WebView web;private boolean ready=false;
  @Override public void onStart(){super.onStart();SyncPresence.visible(this,true);}
  @Override public void onStop(){SyncPresence.visible(this,false);super.onStop();}
  @Override public void onResume(){super.onResume();if(web!=null){web.onResume();if(ready)web.evaluateJavascript("window.refreshNativePlayback && window.refreshNativePlayback()",null);}}
  private String replacementId;private ValueCallback<Uri[]> imageCallback;private boolean skipSimilar=true;
  public void onCreate(Bundle state){super.onCreate(state);
    getWindow().setStatusBarColor(0xff39273f);getWindow().setNavigationBarColor(0xff4c3048);
    if(Build.VERSION.SDK_INT>=33&&checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},1);
    web=new WebView(this);web.setBackgroundColor(0xff39273f);
    FrameLayout frame=new FrameLayout(this);frame.addView(web,new FrameLayout.LayoutParams(-1,-1));setContentView(frame);
    if(Build.VERSION.SDK_INT>=30){getWindow().setDecorFitsSystemWindows(false);frame.setOnApplyWindowInsetsListener((v,insets)->{android.graphics.Insets edges=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());v.setPadding(edges.left,edges.top,edges.right,edges.bottom);return insets;});}
    WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setMediaPlaybackRequiresUserGesture(true);
    web.setWebChromeClient(new WebChromeClient(){public boolean onShowFileChooser(WebView w,ValueCallback<Uri[]> callback,FileChooserParams params){if(imageCallback!=null)imageCallback.onReceiveValue(null);imageCallback=callback;try{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,20);}catch(Exception e){imageCallback.onReceiveValue(null);imageCallback=null;}return true;}});
    web.addJavascriptInterface(new Bridge(),"Android");
    web.setWebViewClient(new WebViewClient(){
      public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest r){return true;}
      public WebResourceResponse shouldInterceptRequest(WebView w,WebResourceRequest req){
        try{
          Uri uri=req.getUrl();if(!"https".equals(uri.getScheme())||!"app.luma.local".equals(uri.getHost()))return denied();
          String p=uri.getPath();if(p==null)return denied();
          if(p.matches("/art/[a-f0-9]{64}")){String id=p.substring(5);JSONObject t=Store.track(MainActivity.this,id);return new WebResourceResponse(t.optString("coverType","image/jpeg"),null,new FileInputStream(new File(getFilesDir(),"art/"+id)));}
          if(p.matches("/assets/ambient-(wind|snow|fire)\\.wav"))return new WebResourceResponse("audio/wav",null,getAssets().open(p.substring(1)));
          if(p.equals("/assets/app-icon.png")||p.equals("/assets/alpine-radio.png")||p.equals("/assets/night-altitude.png")||p.equals("/assets/PressStart2P-Regular.ttf"))return new WebResourceResponse(p.endsWith("png")?"image/png":"font/ttf",null,getAssets().open(p.substring(1)));
          if(!p.matches("/(index.html|style.css|trail.css|music-tools.js|playlist-sync.js|favorite-sync.js|sound.js|settings.js|settings.css|track-actions.js|details.css|compact.css|cover-editor.js|navigation.js|popover.js|library-actions.js|network.js|collections.js|device-sound.js|album-picker.js|album-picker.css|record-palette.js|living.js|living.css|journal.js|journal.css|theme.js|theme.css|reflection.css|mix-tools.js|mixes.js|mixes.css|queue-editor.js|queue-panel.js|queue-panel.css|app.js)"))return denied();
          String type=p.endsWith("css")?"text/css":p.endsWith("js")?"application/javascript":"text/html";
          return new WebResourceResponse(type,"UTF-8",getAssets().open(p.substring(1)));
        }catch(Exception e){return denied();}
      }
      public void onPageFinished(WebView w,String url){ready=true;handleLink(getIntent());}
    });
    web.loadUrl("https://app.luma.local/index.html");
  }
  private PictureInPictureParams miniParams(){java.util.List<RemoteAction> actions=new java.util.ArrayList<>();String[] commands={"prev","toggle","next"},names={"Назад","Играть / пауза","Далее"};int[] icons={R.drawable.ic_prev_pixel,R.drawable.ic_play_pixel,R.drawable.ic_next_pixel};for(int i=0;i<3;i++){PendingIntent p=PendingIntent.getService(this,40+i,new Intent(this,PlaybackService.class).setAction(commands[i]),PendingIntent.FLAG_IMMUTABLE);actions.add(new RemoteAction(android.graphics.drawable.Icon.createWithResource(this,icons[i]),names[i],names[i],p));}return new PictureInPictureParams.Builder().setAspectRatio(new android.util.Rational(16,9)).setActions(actions).build();}
  private WebResourceResponse denied(){return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));}
  @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);
    if(request==20){if(imageCallback!=null){Uri selected=result==RESULT_OK&&data!=null?data.getData():null;if(selected==null&&result==RESULT_OK&&data!=null&&data.getClipData()!=null&&data.getClipData().getItemCount()>0)selected=data.getClipData().getItemAt(0).getUri();imageCallback.onReceiveValue(selected==null?null:new Uri[]{selected});imageCallback=null;}return;}
    if(request==22&&result==RESULT_OK&&data!=null&&data.getData()!=null){if(SyncService.running){Store.error="Дождитесь завершения передачи и выберите файл ещё раз";return;}Uri selected=data.getData();try{getContentResolver().takePersistableUriPermission(selected,Intent.FLAG_GRANT_READ_URI_PERMISSION);}catch(Exception ignored){}startForegroundService(new Intent(this,SyncService.class).setAction("replace").putExtra("id",replacementId).putExtra("uri",selected.toString()));return;}
    if(request==21&&result==RESULT_OK&&data!=null){
      if(SyncService.running){Store.error="Дождитесь завершения передачи и выберите файлы ещё раз";return;}
      ArrayList<String> uris=new ArrayList<>();if(data.getClipData()!=null)for(int n=0;n<data.getClipData().getItemCount();n++)uris.add(data.getClipData().getItemAt(n).getUri().toString());else if(data.getData()!=null)uris.add(data.getData().toString());
      for(String u:uris)try{getContentResolver().takePersistableUriPermission(Uri.parse(u),Intent.FLAG_GRANT_READ_URI_PERMISSION);}catch(Exception ignored){}
      if(!uris.isEmpty())startForegroundService(new Intent(this,SyncService.class).setAction("import").putStringArrayListExtra("uris",uris).putExtra("skipSimilar",skipSimilar));
    }
  }
  private void installUpdate(){
    try{if(!Store.updateReady(this))throw new IOException("Сначала скачайте обновление с ПК");UpdateTrust.verify(this,new File(getFilesDir(),"updates/Luma.apk"));
      if(!getPackageManager().canRequestPackageInstalls()){startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+getPackageName())));Store.syncStatus="Разрешите обновления из Tembrival, вернитесь и нажмите «Установить обновление».";return;}
      Intent i=new Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse("content://local.luma.music.updates/app.apk"),"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivity(i);
    }catch(Exception e){Store.error=e.getMessage();}
  }
  @Override public void onPictureInPictureModeChanged(boolean active,android.content.res.Configuration config){super.onPictureInPictureModeChanged(active,config);web.evaluateJavascript("window.setMiniMode("+active+")",null);}
  protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);if(ready)handleLink(intent);}
  private void handleLink(Intent intent){Uri u=intent.getData();if(u!=null&&"luma".equals(u.getScheme())&&"pair".equals(u.getHost())){String host=u.getQueryParameter("host"),pin=u.getQueryParameter("pin");web.evaluateJavascript("window.onPairLink("+JSONObject.quote(host==null?"":host)+","+JSONObject.quote(pin==null?"":pin)+","+JSONObject.quote(u.getQueryParameter("fingerprint")==null?"":u.getQueryParameter("fingerprint"))+")",null);intent.setData(null);}}
  @Override public void onBackPressed(){web.evaluateJavascript("window.handleBackNavigation?window.handleBackNavigation():false",result->{if(!"true".equals(result))moveTaskToBack(true);});}
  class Bridge {
    @JavascriptInterface public String call(String method,String raw){
      try{
        JSONObject args=new JSONObject(raw);
        if(method.equals("load")){JSONObject d=Store.load(MainActivity.this);d.put("resumeNative",new JSONObject(getSharedPreferences("luma",0).getString("resume","{}")));d.put("playlistRecords",PlaylistStore.load(MainActivity.this));d.put("favoriteRecords",FavoriteStore.load(MainActivity.this));d.put("platform","android").put("connection",Store.publicConnection(MainActivity.this)).put("syncStatus",Store.syncStatus).put("revision",Store.revision).put("updateReady",Store.updateReady(MainActivity.this)).put("appVersion",getPackageManager().getPackageInfo(getPackageName(),0).versionName);return d.toString();}
        if(method.equals("updateTrack")){JSONObject t=TrackDetails.update(MainActivity.this,args.getString("id"),args.getJSONObject("details"),false);runOnUiThread(()->{if(PlaybackService.instance!=null)PlaybackService.instance.refreshTrack();});return t.toString();}
        if(method.equals("editCollection")){if(SyncService.running)throw new IOException("Дождитесь завершения передачи");JSONObject result=CollectionStore.edit(MainActivity.this,args);runOnUiThread(()->{if(PlaybackService.instance!=null)PlaybackService.instance.refreshTrack();});return result.toString();}
        if(method.equals("copyTrackText")){JSONArray ids=args.getJSONArray("ids");StringBuilder text=new StringBuilder();for(int i=0;i<ids.length();i++){JSONObject t=Store.track(MainActivity.this,ids.getString(i));if(text.length()>0)text.append("\n");text.append(t.optString("artist")).append(" — ").append(t.optString("title"));}String value=text.toString();runOnUiThread(()->((android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Tembrival",value)));return "{}";}
        if(method.equals("replaceAudio")){if(SyncService.running)throw new IOException("Дождитесь завершения передачи");replacementId=Store.track(MainActivity.this,args.getString("id")).getString("id");runOnUiThread(()->startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("audio/*").addCategory(Intent.CATEGORY_OPENABLE),22));return "{}";}
        if(method.equals("soundSupport"))return new JSONObject().put("message",SoundEngine.support()).toString();
        if(method.equals("soundSettings")){final boolean night="night".equals(args.optString("theme"));runOnUiThread(()->{getWindow().setStatusBarColor(night?0xff0c1925:0xff39273f);getWindow().setNavigationBarColor(night?0xff0e202b:0xff4c3048);});getSharedPreferences("luma",0).edit().putString("sound",raw).apply();if(PlaybackService.instance!=null)startService(playerIntent(method,raw));return "{}";}
        if(method.equals("openMini")){if(!getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE))throw new IOException("Телефон не поддерживает плавающее окно. Управление доступно в уведомлении.");runOnUiThread(()->{try{web.evaluateJavascript("window.setMiniMode(true)",null);enterPictureInPictureMode(miniParams());}catch(Exception e){web.evaluateJavascript("window.setMiniMode(false)",null);Store.error="Не удалось открыть мини-плеер";}});return "{}";}
        if(method.equals("savePlaylists"))return PlaylistStore.save(MainActivity.this,args.getJSONArray("records")).toString();
        if(method.equals("saveFavorites"))return FavoriteStore.save(MainActivity.this,args.getJSONArray("records")).toString();
        if(method.equals("status")){JSONObject d=PlaybackService.status();d.put("discoveredServers",SyncConnection.found).put("discoveryRevision",SyncConnection.discoveryRevision).put("connectionState",SyncService.connectionState).put("connection",Store.publicConnection(MainActivity.this)).put("syncStatus",Store.syncStatus).put("revision",Store.revision).put("error",Store.error).put("busy",SyncService.running).put("updateReady",Store.updateReady(MainActivity.this));return d.toString();}
        if(method.equals("importFiles")){if(SyncService.running)throw new IOException("Дождитесь завершения передачи");skipSimilar=args.optBoolean("skipSimilar",true);runOnUiThread(()->{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("audio/*").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);startActivityForResult(i,21);});return "{}";}
        if(method.equals("removeTracks")){if(SyncService.running)throw new IOException("Дождитесь завершения передачи");return Store.remove(MainActivity.this,args.getJSONArray("ids")).toString();}
        if(method.equals("installUpdate")){if(SyncService.running)throw new IOException("Дождитесь завершения передачи");runOnUiThread(()->installUpdate());return "{}";}
        if(method.equals("inspectPeer")){
          if(SyncService.running)throw new IOException("Дождитесь завершения передачи");SyncService.cancelled=false;String server=SyncService.validateServer(args.getString("server"));java.net.HttpURLConnection connection=SyncConnection.openPinned(MainActivity.this,server,"/v1/hello",null,null,true);
          try{connection.connect();if(connection.getResponseCode()!=200)throw new IOException("ПК не ответил");String fingerprint=SecureTransport.fingerprint((java.security.cert.X509Certificate)((javax.net.ssl.HttpsURLConnection)connection).getServerCertificates()[0]);return new JSONObject().put("fingerprint",fingerprint).put("code",SecureTransport.code(fingerprint)).toString();}finally{connection.disconnect();}
        }
        if(method.equals("pair")){
          final String server=SyncService.validateServer(args.getString("server")),pin=args.getString("pin");
          if(!pin.matches("[0-9]{6}"))throw new IOException("Введите 6 цифр с экрана ПК");
          startSync(new Intent(MainActivity.this,SyncService.class).setAction("pair").putExtra("server",server).putExtra("pin",pin).putExtra("fingerprint",args.getString("fingerprint")));return "{}";
        }
        if(method.equals("discover")){startSync(new Intent(MainActivity.this,SyncService.class).setAction("discover"));return "{}";}
        if(method.equals("networkSettings")){runOnUiThread(()->{try{startActivity(new Intent(Settings.ACTION_WIRELESS_SETTINGS));}catch(Exception ignored){startActivity(new Intent(Settings.ACTION_SETTINGS));}});return "{}";}
        if(method.equals("connect")||method.equals("sync")||method.equals("upload")||method.equals("syncPlaylists")||method.equals("update")){if(!Store.connection(MainActivity.this).has("token"))throw new IOException("Сначала подключите компьютер по коду");startSync(new Intent(MainActivity.this,SyncService.class).setAction(method));return "{}";}
        if(method.equals("cancelSync")){SyncService.cancelled=true;SyncConnection.cancel();return "{}";}
        if(method.equals("play")||method.equals("restorePlayback")){startForegroundService(playerIntent(method,raw));return "{}";}
        if(method.equals("setQueue")||method.equals("control")||method.equals("seek")||method.equals("mode")){if(PlaybackService.instance!=null)startService(playerIntent(method,raw));return "{}";}
        throw new IOException("Неизвестная команда");
      }catch(Exception e){return "{\"error\":"+JSONObject.quote(e.getMessage())+"}";}
    }
    private void startSync(Intent i)throws Exception{if(SyncService.running)throw new IOException("Дождитесь завершения текущей передачи");startForegroundService(i);}
    private Intent playerIntent(String method,String raw)throws Exception{File file=new File(getCacheDir(),java.util.UUID.randomUUID()+".json");java.nio.file.Files.write(file.toPath(),raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));return new Intent(MainActivity.this,PlaybackService.class).setAction(method).putExtra("argsFile",file.getName());}
  }
}

