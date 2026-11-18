package local.luma.music;

import android.content.Context;
import android.security.keystore.*;
import android.util.Base64;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import java.security.*;
import java.nio.charset.StandardCharsets;
import org.json.*;

/** AES-GCM wrapping key lives in Android Keystore; only ciphertext in preferences. */
public final class ConnectionSecrets {
  private static final String ALIAS="luma.connection.v2";
  public static synchronized String installationId(Context c)throws java.io.IOException{
    android.content.SharedPreferences prefs=c.getSharedPreferences("luma",0);
    String id=prefs.getString("syncInstallationId","");
    if(!id.matches("[a-f0-9]{32}")){id=java.util.UUID.randomUUID().toString().replace("-","");if(!prefs.edit().putString("syncInstallationId",id).commit())throw new java.io.IOException("Не удалось сохранить идентификатор телефона");}
    return id;
  }
  private static javax.crypto.SecretKey key()throws Exception{
    KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
    if(!store.containsAlias(ALIAS)){KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());generator.generateKey();}
    return (javax.crypto.SecretKey)store.getKey(ALIAS,null);
  }
  public static synchronized void save(Context c,JSONObject value)throws Exception{
    Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());byte[] data=cipher.doFinal(value.toString().getBytes(StandardCharsets.UTF_8));
    String record=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(data,Base64.NO_WRAP);
    if(!c.getSharedPreferences("luma",0).edit().putString("connectionEncrypted",record).remove("connection").commit())throw new java.io.IOException("Не удалось сохранить подключение");
  }
  public static synchronized JSONObject load(Context c)throws Exception{
    android.content.SharedPreferences preferences=c.getSharedPreferences("luma",0);String record=preferences.getString("connectionEncrypted",null);
    if(record==null){String old=preferences.getString("connection","{}");JSONObject value=new JSONObject(old);if(value.has("token"))save(c,value);return value;}
    try{String[] parts=record.split(":",2);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));return new JSONObject(new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8));}
    catch(Exception e){Store.error="Не удалось открыть ключ подключения. Подключите ПК заново по QR; музыка сохранена.";return new JSONObject().put("needsPairing",true);}
  }
}
