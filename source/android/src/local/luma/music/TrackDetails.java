package local.luma.music;
import android.content.Context;
import org.json.*;
import java.io.IOException;

final class TrackDetails {
 static final String[] KEYS={"title","artist","album","year","genre","number","trackVolume","customCover"};
 static JSONObject clean(JSONObject raw)throws Exception{JSONObject out=new JSONObject();for(String k:new String[]{"title","artist","album"})if(raw.has(k)){String v=raw.optString(k,"").trim();if(k.equals("title")&&v.isEmpty())throw new IOException("Введите название трека");out.put(k,v.substring(0,Math.min(500,v.length())));}
  if(raw.has("year")){String value=raw.isNull("year")?"":raw.optString("year");if(value.isEmpty())out.put("year",JSONObject.NULL);else{int year=Integer.parseInt(value);if(year<1||year>9999)throw new IOException("Некорректный год");out.put("year",year);}}
  if(raw.has("number")){double n=raw.getDouble("number");if(n!=Math.floor(n)||n<0||n>9999)throw new IOException("Некорректный номер трека");out.put("number",(int)n);}
  if(raw.has("genre")){JSONArray arr=raw.optJSONArray("genre"),next=new JSONArray();if(arr==null){arr=new JSONArray();for(String v:raw.optString("genre").split(","))arr.put(v);}for(int i=0;i<Math.min(arr.length(),20);i++){String v=arr.optString(i).trim();if(!v.isEmpty())next.put(v.substring(0,Math.min(v.length(),100)));}out.put("genre",next);}
  if(raw.has("trackVolume")){double v=raw.getDouble("trackVolume");if(!Double.isFinite(v)||v<0||v>1)throw new IOException("Громкость трека должна быть от 0 до 100%");out.put("trackVolume",v);}if(raw.has("customCover")){String image=raw.optString("customCover","");if(image.length()>700000||!image.isEmpty()&&!image.matches("data:image/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+"))throw new IOException("Некорректная обложка");out.put("customCover",image);}return out;
 }
 static JSONObject update(Context c,String id,JSONObject details,boolean remote)throws Exception{synchronized(Store.class){JSONObject data=Store.load(c);JSONArray tracks=data.getJSONArray("tracks");for(int i=0;i<tracks.length();i++){JSONObject t=tracks.getJSONObject(i);if(!id.equals(t.optString("id")))continue;long version=remote?details.optLong("detailsUpdatedAt"):Math.max(System.currentTimeMillis(),t.optLong("detailsUpdatedAt")+1);if(remote&&version<=t.optLong("detailsUpdatedAt"))return t;JSONObject clean=clean(details);for(String k:KEYS)if(clean.has(k))t.put(k,clean.get(k));t.put("detailsUpdatedAt",version);Store.save(c,data);return t;}throw new IOException("Трек не найден");}}
}
