package local.luma.music;
import android.content.*;
import android.database.Cursor;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.provider.OpenableColumns;
import org.json.*;
import java.io.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.util.*;

public final class NativeLibrary {
  public interface Progress{void update(String s);}
  public static String hash(File file)throws Exception{MessageDigest digest=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(file)){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1){if(SyncService.cancelled)throw new IOException("Отменено");digest.update(b,0,n);}}StringBuilder h=new StringBuilder();for(byte b:digest.digest())h.append(String.format("%02x",b&255));return h.toString();}
  private static String norm(String s){return Normalizer.normalize(s,Normalizer.Form.NFKC).trim().toLowerCase(Locale.ROOT).replaceAll("\\s+"," ");}
  public static boolean similar(JSONObject a,JSONObject b){return a.optDouble("duration")>0&&b.optDouble("duration")>0&&Math.abs(a.optDouble("duration")-b.optDouble("duration"))<=1.5&&norm(a.optString("title")).equals(norm(b.optString("title")))&&norm(a.optString("artist")).equals(norm(b.optString("artist")))&&!norm(a.optString("artist")).equals("неизвестный исполнитель")&&norm(a.optString("album")).equals(norm(b.optString("album")));}
  private static String tag(MediaMetadataRetriever r,int key,String fallback){String s=r.extractMetadata(key);return s==null||s.trim().isEmpty()?fallback:s;}
  private static double number(String s){try{return Double.parseDouble(s);}catch(Exception e){return 0;}}
  public static void importUris(Context c,ArrayList<String> uris,boolean skipSimilar,Progress progress)throws Exception{
    int added=0,duplicates=0;List<String> errors=new ArrayList<>();File dir=new File(c.getFilesDir(),"audio");dir.mkdirs();
    for(int i=0;i<uris.size();i++){
      if(SyncService.cancelled)throw new IOException("Импорт отменён");Uri uri=Uri.parse(uris.get(i));File part=new File(dir,UUID.randomUUID()+".part");
      try{
        String filename="Track.mp3";try(Cursor cursor=c.getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(cursor!=null&&cursor.moveToFirst())filename=cursor.getString(0);}
        progress.update("Импорт "+(i+1)+" / "+uris.size()+" • "+filename);
        String ext=filename.contains(".")?filename.substring(filename.lastIndexOf('.')).toLowerCase(Locale.ROOT):"";
        if(!ext.matches("\\.(mp3|flac|m4a|aac|ogg|opus|wav|aiff|aif|wma)"))throw new IOException("Неподдерживаемое расширение: "+filename);
        try(InputStream in=c.getContentResolver().openInputStream(uri);FileOutputStream out=new FileOutputStream(part)){if(in==null)throw new IOException("Файл недоступен");byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1){if(SyncService.cancelled)throw new IOException("Отменено");if(dir.getUsableSpace()<5*1024*1024)throw new IOException("Недостаточно памяти");out.write(b,0,n);}out.getFD().sync();}
        if(part.length()==0)throw new IOException("Пустой аудиофайл");String id=hash(part);JSONObject library=Store.load(c);JSONArray tracks=library.getJSONArray("tracks");boolean exists=false;for(int j=0;j<tracks.length();j++)if(tracks.getJSONObject(j).getString("id").equals(id))exists=true;
        if(exists){duplicates++;continue;}
        String stem=filename.substring(0,filename.length()-ext.length());String[] pieces=stem.split("\\s+[-–—]\\s+",2);
        JSONObject t=new JSONObject().put("id",id).put("ext",ext).put("size",part.length()).put("filename",filename).put("folder","С телефона").put("title",pieces.length>1?pieces[1]:stem).put("artist",pieces.length>1?pieces[0]:"Неизвестный исполнитель").put("album","С телефона").put("duration",0).put("addedAt",System.currentTimeMillis()).put("cover",false).put("genre",new JSONArray()).put("number",0).put("disc",1);
        MediaMetadataRetriever r=new MediaMetadataRetriever();byte[] cover=null;
        try{r.setDataSource(part.getPath());t.put("title",tag(r,MediaMetadataRetriever.METADATA_KEY_TITLE,t.getString("title"))).put("artist",tag(r,MediaMetadataRetriever.METADATA_KEY_ARTIST,t.getString("artist"))).put("album",tag(r,MediaMetadataRetriever.METADATA_KEY_ALBUM,t.getString("album"))).put("duration",number(tag(r,MediaMetadataRetriever.METADATA_KEY_DURATION,"0"))/1000).put("bitrate",number(tag(r,MediaMetadataRetriever.METADATA_KEY_BITRATE,"0")));cover=r.getEmbeddedPicture();}catch(Exception ignored){}finally{r.release();}
        boolean same=false;if(skipSimilar)for(int j=0;j<tracks.length();j++)if(similar(t,tracks.getJSONObject(j)))same=true;
        if(same){duplicates++;continue;}
        if(cover!=null&&cover.length<20*1024*1024){File art=new File(c.getFilesDir(),"art");art.mkdirs();Files.write(new File(art,id).toPath(),cover);t.put("cover",true).put("coverType",cover.length>4&&(cover[0]&255)==137?"image/png":"image/jpeg");}
        Files.move(part.toPath(),Store.audio(c,t).toPath(),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);Store.append(c,t,true);added++;
      }catch(Exception e){if(SyncService.cancelled)throw e;errors.add(e.getMessage());}
      finally{part.delete();try{c.getContentResolver().releasePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);}catch(Exception ignored){}}
    }
    Store.syncStatus="Импорт завершён. Добавлено: "+added+". Пропущено повторов: "+duplicates+"."+(errors.isEmpty()?"":" Ошибки: "+String.join("; ",errors));Store.revision++;
  }
}
