package local.luma.music;
import android.content.Context;
import android.media.*;
import org.json.*;
import java.nio.*;
import java.util.concurrent.*;

/** Bounded offline PCM analysis. At most 90 seconds, one worker. */
public final class AudioAnalysis {
 private static final java.util.Set<String> pending=ConcurrentHashMap.newKeySet();
 private static final ExecutorService worker=Executors.newSingleThreadExecutor();
 public interface Result{void done(JSONObject track);}
 public static void analyze(Context c,JSONObject t,Result result){final String id=t.optString("id");if(!pending.add(id))return;worker.execute(()->{MediaExtractor ex=new MediaExtractor();MediaCodec codec=null;try{
  if(t.has("meanDb")){result.done(t);return;}ex.setDataSource(Store.audio(c,t).getPath());MediaFormat format=null;for(int i=0;i<ex.getTrackCount();i++){MediaFormat f=ex.getTrackFormat(i);if(f.getString(MediaFormat.KEY_MIME).startsWith("audio/")){ex.selectTrack(i);format=f;break;}}if(format==null)return;
  codec=MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME));codec.configure(format,null,null,0);codec.start();boolean inputEnd=false,done=false;double sum=0,peak=0;long count=0,deadline=System.currentTimeMillis()+180000;int encoding=AudioFormat.ENCODING_PCM_16BIT;MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();
  while(!done&&System.currentTimeMillis()<deadline){if(!inputEnd){int in=codec.dequeueInputBuffer(10000);if(in>=0){ByteBuffer b=codec.getInputBuffer(in);int size=ex.readSampleData(b,0);long pts=ex.getSampleTime();if(size<0||pts>90000000){codec.queueInputBuffer(in,0,0,0,MediaCodec.BUFFER_FLAG_END_OF_STREAM);inputEnd=true;}else{codec.queueInputBuffer(in,0,size,pts,0);ex.advance();}}}
   int out=codec.dequeueOutputBuffer(info,10000);if(out==MediaCodec.INFO_OUTPUT_FORMAT_CHANGED){MediaFormat f=codec.getOutputFormat();if(f.containsKey(MediaFormat.KEY_PCM_ENCODING))encoding=f.getInteger(MediaFormat.KEY_PCM_ENCODING);}
   if(out>=0){ByteBuffer b=codec.getOutputBuffer(out).order(ByteOrder.LITTLE_ENDIAN);b.position(info.offset);b.limit(info.offset+info.size);if(encoding!=AudioFormat.ENCODING_PCM_16BIT&&encoding!=AudioFormat.ENCODING_PCM_FLOAT)throw new Exception("PCM encoding");int width=encoding==AudioFormat.ENCODING_PCM_FLOAT?4:2;while(b.remaining()>=width){double x=width==4?b.getFloat():b.getShort()/32768.0;if(!Double.isFinite(x))continue;sum+=x*x;peak=Math.max(peak,Math.abs(x));count++;}done=(info.flags&MediaCodec.BUFFER_FLAG_END_OF_STREAM)!=0;codec.releaseOutputBuffer(out,false);}
  }
  if(done&&count>0&&sum>0){double mean=10*Math.log10(sum/count),max=20*Math.log10(Math.max(peak,1e-9));Store.patchAnalysis(c,t.getString("id"),mean,max);t.put("meanDb",mean).put("peakDb",max);result.done(t);}
 }catch(Exception ignored){}finally{try{if(codec!=null){codec.stop();codec.release();}}catch(Exception ignored){}ex.release();pending.remove(id);}});}
}
