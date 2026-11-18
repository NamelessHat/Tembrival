package local.luma.music;

import android.content.Context;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;

public final class Store {
  public static volatile long revision=0;
  public static volatile String syncStatus="Готово к подключению", error="";
  public static boolean updateReady(Context c){return UpdateTrust.valid(c,new File(c.getFilesDir(),"updates/Luma.apk"));}
  public static synchronized void patchAnalysis(Context c,String id,double mean,double peak)throws Exception{JSONObject d=load(c);JSONArray tracks=d.getJSONArray("tracks");for(int i=0;i<tracks.length();i++){JSONObject t=tracks.getJSONObject(i);if(t.getString("id").equals(id)){t.put("meanDb",mean).put("peakDb",peak);save(c,d);break;}}}
  public static synchronized void replace(Context c,String id,JSONObject track)throws Exception{JSONObject data=load(c);JSONArray all=data.getJSONArray("tracks"),next=new JSONArray(),ignored=data.optJSONArray("ignored");if(ignored==null)ignored=new JSONArray();boolean found=false;for(int i=0;i<all.length();i++){JSONObject t=all.getJSONObject(i);if(id.equals(t.getString("id"))){for(String key:TrackDetails.KEYS)if(t.has(key))track.put(key,t.get(key));for(String key:new String[]{"folder","addedAt"})if(t.has(key))track.put(key,t.get(key));track.put("detailsUpdatedAt",Math.max(System.currentTimeMillis(),t.optLong("detailsUpdatedAt")+1));next.put(track);found=true;}else if(!track.getString("id").equals(t.getString("id")))next.put(t);else throw new IOException("Это аудио уже есть в библиотеке");}if(!found)throw new IOException("Трек не найден");ignored.put(id);JSONObject replacements=data.optJSONObject("replacements");if(replacements==null)replacements=new JSONObject();replacements.put(id,track.getString("id"));data.put("replacements",replacements).put("tracks",next).put("ignored",ignored);save(c,data);}
  public static synchronized void mergeReplacements(Context c,JSONObject incoming)throws Exception{JSONObject data=load(c),map=data.optJSONObject("replacements");if(map==null)map=new JSONObject();JSONArray all=data.getJSONArray("tracks"),ignored=data.optJSONArray("ignored");if(ignored==null)ignored=new JSONArray();java.util.Set<String> have=new java.util.HashSet<>(),removed=new java.util.HashSet<>();for(int i=0;i<all.length();i++)have.add(all.getJSONObject(i).getString("id"));boolean changed=false;if(incoming.length()>10000)throw new IOException("Слишком много замен");for(java.util.Iterator<String> it=incoming.keys();it.hasNext();){String id=it.next(),next=incoming.getString(id);if(!id.matches("[a-f0-9]{64}")||!next.matches("[a-f0-9]{64}"))throw new IOException("Некорректная замена");java.util.Set<String> seen=new java.util.HashSet<>();seen.add(id);while(incoming.has(next)){if(!seen.add(next))throw new IOException("Циклическая замена");next=incoming.getString(next);}if(id.equals(next)||!have.contains(next)||next.equals(map.optString(id)))continue;map.put(id,next);changed=true;if(have.contains(id)){removed.add(id);ignored.put(id);}}
    if(changed){JSONArray kept=new JSONArray();java.util.List<JSONObject> deleted=new java.util.ArrayList<>();for(int i=0;i<all.length();i++){JSONObject t=all.getJSONObject(i);if(removed.contains(t.getString("id")))deleted.add(t);else kept.put(t);}data.put("replacements",map).put("tracks",kept).put("ignored",ignored);save(c,data);for(JSONObject t:deleted){audio(c,t).delete();new File(c.getFilesDir(),"art/"+t.getString("id")).delete();}}}
  public static synchronized void append(Context c,JSONObject track,boolean explicit)throws Exception{
    JSONObject data=load(c);JSONArray all=data.getJSONArray("tracks");for(int i=0;i<all.length();i++)if(all.getJSONObject(i).getString("id").equals(track.getString("id")))return;
    if(!explicit&&ignored(c,track.getString("id")))return;
    all.put(track);if(explicit){JSONArray next=new JSONArray(),old=data.optJSONArray("ignored");if(old!=null)for(int i=0;i<old.length();i++)if(!old.getString(i).equals(track.getString("id")))next.put(old.get(i));data.put("ignored",next);}save(c,data);
  }
  public static synchronized boolean ignored(Context c,String id)throws Exception{JSONArray list=load(c).optJSONArray("ignored");if(list!=null)for(int i=0;i<list.length();i++)if(id.equals(list.getString(i)))return true;return false;}
  public static synchronized JSONObject remove(Context c,JSONArray ids)throws Exception{
    JSONObject data=load(c);JSONArray all=data.getJSONArray("tracks"),next=new JSONArray(),ignored=data.optJSONArray("ignored");if(ignored==null)ignored=new JSONArray();int removed=0;
    java.util.Set<String> selected=new java.util.HashSet<>();for(int i=0;i<ids.length();i++){String id=ids.getString(i);if(!id.matches("[a-f0-9]{64}"))throw new IOException("Некорректный трек");selected.add(id);}
    java.util.List<JSONObject> deleted=new java.util.ArrayList<>();for(int i=0;i<all.length();i++){JSONObject t=all.getJSONObject(i);if(selected.contains(t.getString("id"))){ignored.put(t.getString("id"));deleted.add(t);removed++;}else next.put(t);}
    data.put("tracks",next).put("ignored",ignored);CollectionStore.prune(data,selected);save(c,data);for(JSONObject t:deleted){audio(c,t).delete();new File(c.getFilesDir(),"art/"+t.getString("id")).delete();}return new JSONObject().put("removed",removed);
  }
  public static synchronized JSONObject load(Context c)throws Exception {
    File f=new File(c.getFilesDir(),"library.json");
    if(!f.exists())return new JSONObject().put("tracks",new JSONArray()).put("version",1);
    return new JSONObject(new String(Files.readAllBytes(f.toPath()),StandardCharsets.UTF_8));
  }
  public static synchronized void save(Context c,JSONObject data)throws Exception {
    File temp=new File(c.getFilesDir(),"library.json.tmp"),target=new File(c.getFilesDir(),"library.json");
    try(FileOutputStream out=new FileOutputStream(temp)){out.write(data.toString().getBytes(StandardCharsets.UTF_8));out.getFD().sync();}
    Files.move(temp.toPath(),target.toPath(),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);revision++;
  }
  public static File audio(Context c,JSONObject t)throws Exception {
    String id=t.getString("id"),ext=t.getString("ext");
    if(!id.matches("[a-f0-9]{64}")||!ext.matches("\\.(mp3|flac|m4a|aac|ogg|opus|wav|aiff|aif|wma)"))throw new IOException("Недопустимый файл в библиотеке");
    File dir=new File(c.getFilesDir(),"audio");dir.mkdirs();return new File(dir,id+ext);
  }
  public static JSONObject track(Context c,String id)throws Exception {
    JSONArray all=load(c).getJSONArray("tracks");for(int i=0;i<all.length();i++)if(all.getJSONObject(i).getString("id").equals(id))return all.getJSONObject(i);
    throw new IOException("Трек не найден");
  }
  public static JSONObject connection(Context c)throws Exception {
    return ConnectionSecrets.load(c);
  }
  public static JSONObject publicConnection(Context c)throws Exception {
    JSONObject value=connection(c);if(value.has("token"))value.put("token",true);return value;
  }
}
