package local.luma.music;

import android.content.Context;
import java.net.HttpURLConnection;
import java.io.InputStream;
import java.util.concurrent.*;
import org.json.JSONObject;

/** Foreground/transfer presence, independent of sync cancellation and UI polling. */
public final class SyncPresence {
  private static final ScheduledExecutorService worker=Executors.newSingleThreadScheduledExecutor();
  private static volatile boolean visible=false;
  private static ScheduledFuture<?> ticker;
  public static synchronized void visible(Context c,boolean value){visible=value;refresh(c);}
  public static synchronized void refresh(Context c){
    Context app=c.getApplicationContext();
    if(ticker!=null){ticker.cancel(false);ticker=null;}
    if(visible||SyncService.running)ticker=worker.scheduleWithFixedDelay(()->send(app),0,15,TimeUnit.SECONDS);
    else worker.execute(()->send(app));
  }
  private static void send(Context c){
    HttpURLConnection h=null;
    try{
      JSONObject peer=Store.connection(c);if(!peer.has("token")||!peer.optString("fingerprint").matches("[a-f0-9]{64}"))return;
      h=SyncConnection.openPresence(c,peer);h.setReadTimeout(3000);h.setRequestMethod("POST");
      h.setRequestProperty("X-Presence",visible||SyncService.running?"online":"offline");h.setDoOutput(true);h.setFixedLengthStreamingMode(0);h.getOutputStream().close();
      if(h.getResponseCode()==200)try(InputStream in=h.getInputStream()){while(in.read()!=-1){}}
    }catch(Exception ignored){/* A missing PC must not interrupt local listening. */}
    finally{if(h!=null)h.disconnect();}
  }
}
