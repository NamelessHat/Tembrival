package local.luma.music;
import android.content.Context;
import org.json.*;
import java.io.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public final class FavoriteStore {
 public static synchronized JSONArray load(Context c)throws Exception{File f=new File(c.getFilesDir(),"favorites.json");return f.exists()?new JSONArray(new String(Files.readAllBytes(f.toPath()),StandardCharsets.UTF_8)):new JSONArray();}
 public static JSONArray merge(JSONArray a,JSONArray b)throws Exception{
  TreeMap<String,JSONObject> map=new TreeMap<>();for(JSONArray list:new JSONArray[]{a,b}){if(list.length()>100000)throw new IOException("Слишком много отметок избранного");for(int i=0;i<list.length();i++){
   JSONObject r=list.getJSONObject(i);String id=r.getString("id"),actor=r.getString("actor");long version=r.getLong("version");if(!id.matches("[a-f0-9]{64}")||!actor.matches("[-a-zA-Z0-9_]{1,80}")||version<1||version>9007199254740991L||!(r.get("version") instanceof Number)||((Number)r.get("version")).doubleValue()!=version||!(r.get("liked") instanceof Boolean))throw new IOException("Некорректное избранное");
   JSONObject next=new JSONObject().put("id",id).put("liked",r.getBoolean("liked")).put("version",version).put("actor",actor),old=map.get(id);
   if(old==null||version>old.getLong("version")||version==old.getLong("version")&&(!next.getBoolean("liked")&&old.getBoolean("liked")||next.getBoolean("liked")==old.getBoolean("liked")&&actor.compareTo(old.getString("actor"))>0))map.put(id,next);
  }}if(map.size()>100000)throw new IOException("Слишком много отметок избранного");return new JSONArray(map.values());
 }
 public static synchronized JSONArray save(Context c,JSONArray records)throws Exception{JSONArray old=load(c),next=merge(old,records);if(!old.toString().equals(next.toString())){File target=new File(c.getFilesDir(),"favorites.json"),tmp=new File(c.getFilesDir(),"favorites.json.tmp");try(FileOutputStream out=new FileOutputStream(tmp)){out.write(next.toString().getBytes(StandardCharsets.UTF_8));out.getFD().sync();}Files.move(tmp.toPath(),target.toPath(),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);Store.revision++;}return next;}
}
