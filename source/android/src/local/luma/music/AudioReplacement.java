package local.luma.music;
import android.content.*;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.media.MediaMetadataRetriever;
import org.json.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;

final class AudioReplacement {
 static void replace(Context c,String id,String uriText)throws Exception{
  JSONObject old=Store.track(c,id);Uri uri=Uri.parse(uriText);File audioDir=new File(c.getFilesDir(),"audio");audioDir.mkdirs();File part=new File(audioDir,UUID.randomUUID()+".part"),created=null;boolean committed=false;
  try{
   String filename="";try(Cursor cursor=c.getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(cursor!=null&&cursor.moveToFirst())filename=cursor.getString(0);}String ext=filename.contains(".")?filename.substring(filename.lastIndexOf('.')).toLowerCase(Locale.ROOT):"";if(!ext.matches("\\.(mp3|flac|m4a|aac|ogg|opus|wav|aiff|aif|wma)"))throw new IOException("Выберите аудиофайл поддерживаемого формата");
   Store.syncStatus="Копируем новое аудио…";try(InputStream in=c.getContentResolver().openInputStream(uri);FileOutputStream out=new FileOutputStream(part)){if(in==null)throw new IOException("Файл недоступен");byte[] bytes=new byte[65536];int n;while((n=in.read(bytes))!=-1){if(SyncService.cancelled)throw new IOException("Отменено");if(audioDir.getUsableSpace()<5*1024*1024)throw new IOException("Недостаточно памяти");out.write(bytes,0,n);}out.getFD().sync();}
   if(part.length()<1)throw new IOException("Пустой файл");String nextId=NativeLibrary.hash(part);if(id.equals(nextId)){Store.syncStatus="Это то же самое аудио.";return;}JSONArray all=Store.load(c).getJSONArray("tracks");for(int i=0;i<all.length();i++)if(nextId.equals(all.getJSONObject(i).getString("id")))throw new IOException("Этот файл уже есть в библиотеке. Выберите другое аудио.");
   MediaMetadataRetriever metadata=new MediaMetadataRetriever();long duration;byte[] cover=null;try{metadata.setDataSource(part.getPath());duration=Long.parseLong(metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION));cover=metadata.getEmbeddedPicture();if(duration<=0)throw new IOException("Не удалось прочитать аудио");}finally{metadata.release();}
   JSONObject next=new JSONObject(old.toString());next.put("id",nextId).put("ext",ext).put("size",part.length()).put("duration",duration/1000.0).put("filename",filename).put("detailsUpdatedAt",Math.max(System.currentTimeMillis(),old.optLong("detailsUpdatedAt")+1));next.remove("meanDb");next.remove("peakDb");
   File artDir=new File(c.getFilesDir(),"art");artDir.mkdirs();File art=new File(artDir,nextId);if(cover!=null&&cover.length<20*1024*1024){Files.write(art.toPath(),cover);next.put("cover",true).put("coverType",cover.length>4&&(cover[0]&255)==137?"image/png":"image/jpeg");}else if(old.optBoolean("cover")){Files.copy(new File(artDir,id).toPath(),art.toPath(),StandardCopyOption.REPLACE_EXISTING);}
   created=Store.audio(c,next);Files.move(part.toPath(),created.toPath(),StandardCopyOption.ATOMIC_MOVE);Store.replace(c,id,next);committed=true;Store.audio(c,old).delete();new File(artDir,id).delete();Store.syncStatus="Аудио заменено. Плейлисты и сведения сохранены.";
  }finally{part.delete();if(!committed&&created!=null)created.delete();try{c.getContentResolver().releasePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);}catch(Exception ignored){}}
 }
}
