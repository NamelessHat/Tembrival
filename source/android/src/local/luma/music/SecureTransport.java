package local.luma.music;

import java.io.*;
import java.security.*;
import java.security.cert.*;
import javax.net.ssl.*;

/** Per-connection SPKI pinning, never a process-wide trust override. The explicit
 * inspection path carries no credentials; the user must compare its code on PC. */
public final class SecureTransport {
  public static String fingerprint(X509Certificate certificate)throws Exception{
    byte[] digest=MessageDigest.getInstance("SHA-256").digest(certificate.getPublicKey().getEncoded());StringBuilder s=new StringBuilder();for(byte b:digest)s.append(String.format("%02x",b&255));return s.toString();
  }
  public static String code(String fingerprint){return fingerprint.substring(0,32).toUpperCase(java.util.Locale.ROOT).replaceAll("(.{4})(?!$)","$1 ");}
  public static String[] configure(HttpsURLConnection connection,String expected,boolean inspect)throws Exception{
    if(!inspect&&(expected==null||!expected.matches("[a-f0-9]{64}")))throw new SyncConnection.Rejected("Нужно защищённое сопряжение. Создайте новый QR на ПК.");
    final String[] observed={null};
    X509TrustManager trust=new X509TrustManager(){
      public X509Certificate[] getAcceptedIssuers(){return new X509Certificate[0];}
      public void checkClientTrusted(X509Certificate[] chain,String auth)throws CertificateException{throw new CertificateException("Client certificates are not accepted");}
      public void checkServerTrusted(X509Certificate[] chain,String auth)throws CertificateException{
        try{
          if(chain==null||chain.length!=1)throw new CertificateException("Ожидалось удостоверение Tembrival");
          X509Certificate cert=chain[0];cert.checkValidity();cert.verify(cert.getPublicKey());
          if(!cert.getSigAlgName().toUpperCase(java.util.Locale.ROOT).contains("SHA256"))throw new CertificateException("Недопустимая подпись TLS");
          if(!(cert.getPublicKey() instanceof java.security.interfaces.RSAPublicKey)||((java.security.interfaces.RSAPublicKey)cert.getPublicKey()).getModulus().bitLength()<2048)throw new CertificateException("Слабый ключ TLS");
          String actual=fingerprint(cert);if(!inspect&&!MessageDigest.isEqual(actual.getBytes("US-ASCII"),expected.getBytes("US-ASCII")))throw new CertificateException("Удостоверение ПК изменилось. Передача остановлена; проверьте ПК и подключите его заново.");observed[0]=actual;
        }catch(CertificateException e){throw e;}catch(Exception e){throw new CertificateException("Не удалось проверить удостоверение ПК",e);}
      }
    };
    SSLContext tls=SSLContext.getInstance("TLS");tls.init(null,new TrustManager[]{trust},new SecureRandom());connection.setSSLSocketFactory(tls.getSocketFactory());
    // Identity is the explicitly approved SPKI, not a DHCP-assigned IP name.
    connection.setHostnameVerifier((host,session)->{try{return observed[0]!=null&&(inspect||observed[0].equals(expected))&&observed[0].equals(fingerprint((X509Certificate)session.getPeerCertificates()[0]));}catch(Exception e){return false;}});
    return observed;
  }
}
