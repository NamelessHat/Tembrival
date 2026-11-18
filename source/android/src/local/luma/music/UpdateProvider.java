package local.luma.music;
import android.content.*;
import android.database.*;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;
public class UpdateProvider extends ContentProvider {
  public boolean onCreate(){return true;}
  private File file(Uri uri)throws FileNotFoundException{if(!"/app.apk".equals(uri.getPath()))throw new FileNotFoundException();return new File(getContext().getFilesDir(),"updates/Luma.apk");}
  public String getType(Uri uri){return "application/vnd.android.package-archive";}
  public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{if(!"r".equals(mode))throw new FileNotFoundException();return ParcelFileDescriptor.open(file(uri),ParcelFileDescriptor.MODE_READ_ONLY);}
  public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){try{File f=file(uri);String[] names=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;MatrixCursor out=new MatrixCursor(names);Object[] values=new Object[names.length];for(int i=0;i<names.length;i++)values[i]=names[i].equals(OpenableColumns.DISPLAY_NAME)?"Tembrival-Android.apk":names[i].equals(OpenableColumns.SIZE)?f.length():null;out.addRow(values);return out;}catch(Exception e){return null;}}
  public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException();}
}
