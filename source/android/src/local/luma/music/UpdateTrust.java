package local.luma.music;

import android.content.Context;
import android.content.pm.*;
import android.os.Build;
import java.io.*;
import java.util.*;

public final class UpdateTrust {
  private static String checkedPath="";private static long checkedSize=-1,checkedTime=-1;private static boolean checkedResult;
  public static synchronized boolean valid(Context context,File apk){
    long size=apk.length(),time=apk.lastModified();if(apk.getPath().equals(checkedPath)&&size==checkedSize&&time==checkedTime)return checkedResult;
    checkedPath=apk.getPath();checkedSize=size;checkedTime=time;
    try{verify(context,apk);checkedResult=true;}catch(Exception e){checkedResult=false;}return checkedResult;
  }
  public static void verify(Context c,File apk)throws Exception{
    int flags=Build.VERSION.SDK_INT>=28?PackageManager.GET_SIGNING_CERTIFICATES:PackageManager.GET_SIGNATURES;
    PackageInfo incoming=c.getPackageManager().getPackageArchiveInfo(apk.getPath(),flags),own=c.getPackageManager().getPackageInfo(c.getPackageName(),flags);
    if(incoming==null||!c.getPackageName().equals(incoming.packageName))throw new IOException("Получен APK другого приложения");
    long next=Build.VERSION.SDK_INT>=28?incoming.getLongVersionCode():incoming.versionCode,current=Build.VERSION.SDK_INT>=28?own.getLongVersionCode():own.versionCode;
    if(next<=current)throw new IOException("Это обновление уже установлено или устарело");
    Signature[] a=Build.VERSION.SDK_INT>=28?incoming.signingInfo.getApkContentsSigners():incoming.signatures,b=Build.VERSION.SDK_INT>=28?own.signingInfo.getApkContentsSigners():own.signatures;
    if(a==null||b==null||a.length!=b.length||a.length==0)throw new IOException("Не удалось проверить подпись APK");
    Set<String> left=new HashSet<>(),right=new HashSet<>();for(Signature s:a)left.add(s.toCharsString());for(Signature s:b)right.add(s.toCharsString());
    if(!left.equals(right))throw new IOException("Подпись обновления отличается. Установка остановлена");
  }
}
