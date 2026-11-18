package local.luma.music;
import android.content.*;
import android.media.*;
import android.media.audiofx.*;
import android.content.res.AssetFileDescriptor;
import org.json.*;

final class SoundEngine {
 private final Context context;private MediaPlayer player,ambient;private Equalizer eq;private LoudnessEnhancer enhancer;private JSONObject settings=new JSONObject(),track;private float duck=1;private String scene="off";private boolean playing=false;
 SoundEngine(Context c){context=c;try{settings=new JSONObject(c.getSharedPreferences("luma",0).getString("sound","{}"));}catch(Exception ignored){}}
 void attach(MediaPlayer p,JSONObject t){releaseEffects();player=p;track=t;try{eq=new Equalizer(0,p.getAudioSessionId());eq.setEnabled(true);}catch(Exception ignored){}try{enhancer=new LoudnessEnhancer(p.getAudioSessionId());}catch(Exception ignored){}apply();if(settings.optBoolean("normalize"))analyze();}
 void trackChanged(JSONObject t){track=t;apply();}
 void analyze(){if(track==null||track.has("meanDb"))return;JSONObject pending=track;AudioAnalysis.analyze(context,pending,t->{new android.os.Handler(android.os.Looper.getMainLooper()).post(()->{if(track==pending){track=t;apply();}});});}
 void settings(JSONObject s){settings=s;context.getSharedPreferences("luma",0).edit().putString("sound",s.toString()).apply();apply();if(s.optBoolean("normalize"))analyze();}
 void duck(float value){duck=value;apply();}
 void playing(boolean value){playing=value;applyAmbient();}
 void apply(){try{
  JSONArray bands=settings.optJSONArray("eq");double headroom=0;if(bands!=null)for(int i=0;i<bands.length();i++)headroom=Math.max(headroom,Math.min(12,bands.optDouble(i)));int[] centers={60,250,1000,4000,12000};
  if(eq!=null){short[] range=eq.getBandLevelRange();for(short i=0;i<eq.getNumberOfBands();i++){int freq=eq.getCenterFreq(i)/1000,best=0;double distance=Double.MAX_VALUE;for(int j=0;j<centers.length;j++){double d=Math.abs(Math.log(Math.max(1,freq)/(double)centers[j]));if(d<distance){distance=d;best=j;}}int level=(int)(100*(bands==null?0:bands.optDouble(best)));eq.setBandLevel(i,(short)Math.max(range[0],Math.min(range[1],level)));}}
  double gain=settings.optBoolean("normalize")&&track!=null&&track.has("meanDb")?Math.max(-18,Math.min(9,Math.min(-18-track.optDouble("meanDb"),-1-track.optDouble("peakDb")))):0;gain-=headroom;
  if(enhancer!=null){enhancer.setTargetGain((int)Math.max(0,gain*100));enhancer.setEnabled(gain>0);}float volume=(float)(Math.pow(10,Math.min(0,gain)/20)*duck*VolumePolicy.gain(settings,track));if(player!=null)player.setVolume(volume,volume);
 }catch(Exception ignored){}applyAmbient();}
 private void applyAmbient(){try{String wanted=settings.optString("atmosphere","off");if(!wanted.matches("off|wind|snow|fire"))wanted="off";if(!wanted.equals(scene)){if(ambient!=null){ambient.release();ambient=null;}scene=wanted;if(!scene.equals("off")){ambient=new MediaPlayer();ambient.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());try(AssetFileDescriptor f=context.getAssets().openFd("assets/ambient-"+scene+".wav")){ambient.setDataSource(f.getFileDescriptor(),f.getStartOffset(),f.getLength());}ambient.setLooping(true);ambient.prepare();}}
  if(ambient!=null){float v=(float)Math.max(0,Math.min(.6,settings.optDouble("atmosphereVolume",.18)))*duck;ambient.setVolume(v,v);if(playing&&!ambient.isPlaying())ambient.start();else if(!playing&&ambient.isPlaying())ambient.pause();}
 }catch(Exception e){if(ambient!=null){ambient.release();ambient=null;}scene="off";}}
 static String support(){boolean equalizer=false;try{AudioEffect.Descriptor[] list=AudioEffect.queryEffects();if(list!=null)for(AudioEffect.Descriptor d:list)if(d.type.equals(AudioEffect.EFFECT_TYPE_EQUALIZER))equalizer=true;}catch(Exception ignored){}return equalizer?"Частоты эквалайзера подстраиваются под возможности телефона.":"Системный эквалайзер на этом телефоне недоступен. Баланс громкости продолжит работать.";}
 private void releaseEffects(){if(eq!=null){eq.release();eq=null;}if(enhancer!=null){enhancer.release();enhancer=null;}}
 void detach(){player=null;releaseEffects();}
 void release(){detach();if(ambient!=null){ambient.release();ambient=null;}}
}
