package local.luma.music;
import android.content.Context;
import org.json.*;
import java.io.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public final class PlaylistStore {
 public static synchronized JSONArray load(Context c)throws Exception{File f=new File(c.getFilesDir(),"playlists.json");return f.exists()?new JSONArray(new String(Files.readAllBytes(f.toPath()),StandardCharsets.UTF_8)):new JSONArray();}
 private static JSONObject clean(JSONObject p)throws Exception{
  String id=p.getString("id"),image=p.optString("image","");if(!id.matches("[-a-zA-Z0-9_~]{1,120}"))throw new IOException("Некорректный плейлист");if(image.length()>700000||!image.isEmpty()&&!image.matches("data:image/(jpeg|png|webp|gif);base64,[a-zA-Z0-9+/=]+"))throw new IOException("Некорректная обложка");
  JSONObject clock=p.optJSONObject("clock"),outClock=new JSONObject();if(clock!=null)for(Iterator<String> i=clock.keys();i.hasNext();){String k=i.next();long v=clock.getLong(k);if(!k.matches("[-a-zA-Z0-9_]{1,80}")||v<0||v>9007199254740991L)throw new IOException("Некорректная версия");outClock.put(k,v);}
  JSONArray tracks=new JSONArray(),source=p.optJSONArray("tracks");Set<String> seen=new HashSet<>();if(source!=null)for(int i=0;i<source.length();i++){String t=source.optString(i);if(t.matches("[a-f0-9]{64}")&&seen.add(t))tracks.put(t);}
  String name=p.optString("name","Плейлист"),description=p.optString("description","");return new JSONObject().put("id",id).put("name",name.substring(0,Math.min(100,name.length()))).put("description",description.substring(0,Math.min(1000,description.length()))).put("image",image).put("tracks",tracks).put("clock",outClock).put("editId",p.optString("editId",id).replaceAll("[^a-zA-Z0-9-]","").substring(0,Math.min(80,p.optString("editId",id).replaceAll("[^a-zA-Z0-9-]","").length()))).put("deleted",p.optBoolean("deleted"));
 }
 private static String payload(JSONObject p)throws Exception{return new JSONArray().put(p.getString("name")).put(p.getString("description")).put(p.getString("image")).put(p.getJSONArray("tracks")).put(p.getBoolean("deleted")).toString();}
 public static JSONArray merge(JSONArray a,JSONArray b)throws Exception{
  if(a.length()+b.length()>2000)throw new IOException("Слишком много плейлистов");TreeMap<String,JSONObject> map=new TreeMap<>();
  for(JSONArray list:new JSONArray[]{a,b})for(int i=0;i<list.length();i++){
   JSONObject p=clean(list.getJSONObject(i)),old=map.get(p.getString("id"));String id=p.getString("id");if(old==null){map.put(id,p);continue;}
   JSONObject pc=p.getJSONObject("clock"),oc=old.getJSONObject("clock");Set<String> keys=new HashSet<>();pc.keys().forEachRemaining(keys::add);oc.keys().forEachRemaining(keys::add);boolean gt=false,lt=false;for(String k:keys){gt|=pc.optLong(k)>oc.optLong(k);lt|=pc.optLong(k)<oc.optLong(k);}if(gt&&!lt){map.put(id,p);continue;}if(lt&&!gt)continue;
   if(payload(p).equals(payload(old))){for(String k:keys)oc.put(k,Math.max(pc.optLong(k),oc.optLong(k)));if(p.getString("editId").compareTo(old.getString("editId"))>0)old.put("editId",p.getString("editId"));continue;}
   JSONObject winner=p.getString("editId").compareTo(old.getString("editId"))>0?p:old,loser=winner==p?old:p;map.put(id,winner);
   if(!loser.getBoolean("deleted")){JSONObject fork=new JSONObject(loser.toString());String name=fork.getString("name");fork.put("id","fork-"+fork.getString("editId"));if(!name.endsWith(" (другая версия)"))fork.put("name",name.substring(0,Math.min(83,name.length()))+" (другая версия)");if(!map.containsKey(fork.getString("id")))map.put(fork.getString("id"),fork);}
  }return new JSONArray(map.values());
 }
 public static synchronized JSONArray save(Context c,JSONArray incoming)throws Exception{JSONArray old=load(c),next=merge(old,incoming);if(!old.toString().equals(next.toString())){File f=new File(c.getFilesDir(),"playlists.json"),tmp=new File(c.getFilesDir(),"playlists.json.tmp");try(FileOutputStream out=new FileOutputStream(tmp)){out.write(next.toString().getBytes(StandardCharsets.UTF_8));out.getFD().sync();}Files.move(tmp.toPath(),f.toPath(),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);Store.revision++;}return next;}
}
