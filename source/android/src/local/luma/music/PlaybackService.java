package local.luma.music;
import android.app.*;
import android.os.*;
import android.content.*;
import android.media.*;
import android.media.session.*;
import org.json.*;
import java.util.*;

public class PlaybackService extends Service {
  public static volatile PlaybackService instance;
  private final PlayerNotice notice=new PlayerNotice();private SoundEngine sound;private long initialPosition=0;private boolean startPaused=false;private MediaPlayer player;private MediaSession session;private AudioManager manager;private AudioFocusRequest focus;
  private volatile String queueToken="";private volatile List<String> queue=new ArrayList<>();private int index=0,repeat=0;private boolean shuffle=false,prepared=false,resumeOnFocus=false;
  private JSONObject current;private final Handler handler=new Handler(Looper.getMainLooper());
  public IBinder onBind(Intent i){return null;}
  public static JSONObject status()throws Exception{PlaybackService s=instance;JSONObject d=new JSONObject();if(s==null)return d;return d.put("queueToken",s.queueToken).put("id",s.current==null?"":s.current.optString("id")).put("playing",s.isPlaying()).put("index",s.index).put("position",s.position()).put("duration",s.duration()).put("ids",new JSONArray(s.queue)).put("shuffle",s.shuffle).put("repeat",s.repeat);}
  public void onCreate(){super.onCreate();instance=this;sound=new SoundEngine(this);handler.postDelayed(checkpoint,2000);manager=getSystemService(AudioManager.class);
    getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel("playback","Воспроизведение",NotificationManager.IMPORTANCE_LOW));
    focus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build()).setOnAudioFocusChangeListener(change->{
      if(change==AudioManager.AUDIOFOCUS_LOSS){resumeOnFocus=false;pause();}
      else if(change==AudioManager.AUDIOFOCUS_LOSS_TRANSIENT){resumeOnFocus=isPlaying();pause();}
      else if(change==AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK){sound.duck(.2f);}
      else if(change==AudioManager.AUDIOFOCUS_GAIN){sound.duck(1);if(resumeOnFocus){resumeOnFocus=false;resume();}}
    },handler).build();
    session=new MediaSession(this,"Tembrival");session.setCallback(new MediaSession.Callback(){public void onPlay(){resume();}public void onPause(){pause();}public void onSkipToNext(){next(1,false);}public void onSkipToPrevious(){next(-1,false);}public void onSeekTo(long pos){seek(pos);}public void onStop(){stopSelf();}});session.setActive(true);
    if(Build.VERSION.SDK_INT>=33)registerReceiver(noisy,new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),Context.RECEIVER_NOT_EXPORTED);else registerReceiver(noisy,new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
  }
  private final BroadcastReceiver noisy=new BroadcastReceiver(){public void onReceive(Context c,Intent i){resumeOnFocus=false;pause();}};
  private boolean isPlaying(){try{return prepared&&player!=null&&player.isPlaying();}catch(Exception e){return false;}}
  private long position(){try{return prepared&&player!=null?player.getCurrentPosition():0;}catch(Exception e){return 0;}}
  private long duration(){try{return prepared&&player!=null?player.getDuration():0;}catch(Exception e){return 0;}}
  private PendingIntent action(String action,int code){return PendingIntent.getService(this,code,new Intent(this,PlaybackService.class).setAction(action),PendingIntent.FLAG_IMMUTABLE);}
  private Notification notification(){return notice.build(this,session,current,isPlaying());}
  public void refreshFromStore(){try{JSONObject map=Store.load(this).optJSONObject("replacements");if(map==null){refreshTrack();return;}boolean changed=false;List<String> next=new ArrayList<>();for(String id:queue){String target=id;Set<String> seen=new HashSet<>();while(map.has(target)&&seen.add(target))target=map.getString(target);next.add(target);if(current!=null&&id.equals(current.optString("id"))&&!target.equals(id))changed=true;}queue=next;if(changed){initialPosition=0;startPaused=!isPlaying();playIndex(index);}else refreshTrack();}catch(Exception ignored){}}
  public void refreshTrack(){try{if(current!=null){current=Store.track(this,current.getString("id"));sound.trackChanged(current);update();}}catch(Exception ignored){}}
  private void update(){
    long actions=PlaybackState.ACTION_PLAY|PlaybackState.ACTION_PAUSE|PlaybackState.ACTION_PLAY_PAUSE|PlaybackState.ACTION_SKIP_TO_NEXT|PlaybackState.ACTION_SKIP_TO_PREVIOUS|PlaybackState.ACTION_SEEK_TO|PlaybackState.ACTION_STOP;
    session.setPlaybackState(new PlaybackState.Builder().setActions(actions).setState(isPlaying()?PlaybackState.STATE_PLAYING:PlaybackState.STATE_PAUSED,position(),isPlaying()?1:0).build());
    if(current!=null)session.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE,current.optString("title")).putString(MediaMetadata.METADATA_KEY_ARTIST,current.optString("artist")).putString(MediaMetadata.METADATA_KEY_ALBUM,current.optString("album")).putString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE,current.optString("title")).putString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE,current.optString("artist")).putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART,notice.art(this,current)).putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON,notice.art(this,current)).putLong(MediaMetadata.METADATA_KEY_DURATION,duration()).build());
    getSystemService(NotificationManager.class).notify(1,notification());
  }
  public int onStartCommand(Intent intent,int flags,int startId){if(intent==null){stopSelf();return START_NOT_STICKY;}startForeground(1,notification());
    try{String action=intent.getAction(),raw=intent.getStringExtra("args");String argsFile=intent.getStringExtra("argsFile");if(argsFile!=null){if(!argsFile.matches("[a-f0-9-]+\\.json"))throw new Exception("Некорректная очередь");java.io.File file=new java.io.File(getCacheDir(),argsFile);try{raw=new String(java.nio.file.Files.readAllBytes(file.toPath()),java.nio.charset.StandardCharsets.UTF_8);}finally{file.delete();}}JSONObject args=new JSONObject(raw==null?"{}":raw);
      if("play".equals(action)||"restorePlayback".equals(action)||"setQueue".equals(action)){List<String> nextQueue=new ArrayList<>();JSONArray ids=args.getJSONArray("ids");for(int i=0;i<ids.length();i++){String id=ids.getString(i);if(!id.matches("[a-f0-9]{64}"))throw new Exception("Некорректный трек");nextQueue.add(id);}queue=nextQueue;index=Math.max(0,Math.min(queue.size()-1,args.optInt("index",0)));shuffle=args.optBoolean("shuffle",shuffle);repeat=args.optInt("repeat",repeat);queueToken=args.optString("queueToken","");if(!action.equals("setQueue")){initialPosition=args.optLong("position",0);startPaused=action.equals("restorePlayback");playIndex(index);}}
      else if("soundSettings".equals(action)){sound.settings(args);}
      else if("mode".equals(action)){shuffle=args.optBoolean("shuffle");repeat=args.optInt("repeat");}
      else if("seek".equals(action))seek(args.optLong("position"));
      else{String command="control".equals(action)?args.optString("action"):action;if("toggle".equals(command)){if(isPlaying())pause();else resume();}else if("pause".equals(command))pause();else if("stop".equals(command))stopSelf();else if("next".equals(command))next(1,false);else if("prev".equals(command))next(-1,false);}
    }catch(Exception e){Store.error="Не удалось воспроизвести: "+e.getMessage();update();}return START_NOT_STICKY;
  }
  private void playIndex(int target){try{
    if(queue.isEmpty())return;index=Math.max(0,Math.min(queue.size()-1,target));JSONObject t=Store.track(this,queue.get(index));
    if(player!=null){prepared=false;sound.detach();player.release();}current=t;prepared=false;player=new MediaPlayer();
    player.setAudioAttributes(new AudioAttributes.Builder().setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).setUsage(AudioAttributes.USAGE_MEDIA).build());player.setWakeMode(this,PowerManager.PARTIAL_WAKE_LOCK);player.setDataSource(Store.audio(this,t).getPath());
    player.setOnPreparedListener(p->{prepared=true;sound.attach(p,current);if(initialPosition>0){p.seekTo(initialPosition,MediaPlayer.SEEK_CLOSEST);initialPosition=0;}if(startPaused){startPaused=false;update();}else resume();});player.setOnCompletionListener(p->next(1,true));player.setOnErrorListener((p,what,extra)->{Store.error="Этот аудиоформат не поддерживается телефоном ("+what+", "+extra+")";prepared=false;update();return true;});player.prepareAsync();update();
  }catch(Exception e){Store.error="Не удалось открыть трек: "+e.getMessage();prepared=false;update();}}
  private void resume(){if(prepared&&player!=null&&manager.requestAudioFocus(focus)==AudioManager.AUDIOFOCUS_REQUEST_GRANTED){player.start();sound.playing(true);update();}}
  private void pause(){if(prepared&&player!=null){player.pause();sound.playing(false);saveCheckpoint();update();}}
  private void seek(long pos){if(prepared&&player!=null){player.seekTo(Math.max(0,Math.min(duration(),pos)),MediaPlayer.SEEK_CLOSEST);update();}}
  private void next(int direction,boolean ended){if(queue.isEmpty())return;if(direction<0&&position()>3000){seek(0);return;}if(ended&&repeat==1){playIndex(index);return;}int target=index+direction;if(target>=queue.size()){if(repeat==2)target=0;else{sound.playing(false);saveCheckpoint();update();return;}}if(target<0)target=queue.size()-1;playIndex(target);}
  private final Runnable checkpoint=new Runnable(){public void run(){saveCheckpoint();handler.postDelayed(this,2000);}};
  private void saveCheckpoint(){if(current==null)return;try{JSONObject r=status();r.put("position",position()/1000.0);getSharedPreferences("luma",0).edit().putString("resume",r.toString()).apply();}catch(Exception ignored){}}
  public void onDestroy(){saveCheckpoint();handler.removeCallbacks(checkpoint);sound.release();instance=null;if(player!=null)player.release();session.release();manager.abandonAudioFocusRequest(focus);unregisterReceiver(noisy);super.onDestroy();}
}
