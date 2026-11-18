package local.luma.music;

import android.content.*;
import android.net.*;
import android.net.wifi.WifiManager;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Local discovery carries no credentials. A new address must prove knowledge
 * of the existing pairing token before receiving any authenticated request. */
public class SyncConnection {
  public static volatile JSONArray found=new JSONArray();
  public static volatile int discoveryRevision=0;
  private static volatile HttpURLConnection active;
  public static class Rejected extends IOException { public Rejected(String message){super(message);} }
  public static class Missing extends IOException { public Missing(String message){super(message);} }
  public static void cancel(){HttpURLConnection h=active;if(h!=null)h.disconnect();}
  public static boolean local(InetAddress address){return address instanceof Inet4Address&&(address.isSiteLocalAddress()||address.isLinkLocalAddress());}
  private static void check()throws IOException{if(SyncService.cancelled)throw new IOException("Отменено. Передачу можно продолжить позже.");}
  private static boolean sameSubnet(InetAddress a,InetAddress b,int prefix){byte[] x=a.getAddress(),y=b.getAddress();if(x.length!=4||y.length!=4)return false;for(int i=0;i<4;i++){int bits=Math.min(8,Math.max(0,prefix-i*8)),mask=bits==0?0:255<<(8-bits);if((x[i]&mask)!=(y[i]&mask))return false;}return true;}
  public static HttpURLConnection open(Context c,String server,String path,String token)throws Exception{return openPinned(c,server,path,token,Store.connection(c).optString("fingerprint"),false);}
  public static HttpURLConnection openPinned(Context c,String server,String path,String token,String fingerprint,boolean inspect)throws Exception{
    return openPinned(c,server,path,token,fingerprint,inspect,true);
  }
  public static HttpURLConnection openPresence(Context c,JSONObject peer)throws Exception{
    return openPinned(c,peer.getString("server"),"/v1/presence",peer.getString("token"),peer.getString("fingerprint"),false,false);
  }
  private static HttpURLConnection openPinned(Context c,String server,String path,String token,String fingerprint,boolean inspect,boolean cancellable)throws Exception{
    if(cancellable)check();URL url=new URL(SyncService.validateServer(server)+path);URLConnection connection=null;InetAddress target=InetAddress.getByName(url.getHost());
    ConnectivityManager cm=c.getSystemService(ConnectivityManager.class);
    for(Network network:cm.getAllNetworks()){NetworkCapabilities caps=cm.getNetworkCapabilities(network);LinkProperties link=cm.getLinkProperties(network);
      if(caps==null||link==null||!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)||caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN))continue;
      for(LinkAddress address:link.getLinkAddresses())if(sameSubnet(address.getAddress(),target,address.getPrefixLength())){connection=network.openConnection(url);break;}if(connection!=null)break;
    }
    // A phone's own hotspot has a local route but is not a ConnectivityManager
    // Wi-Fi client network. Let the kernel select that route in this case.
    if(connection==null)connection=url.openConnection();HttpURLConnection h=(HttpURLConnection)connection;if(!(h instanceof javax.net.ssl.HttpsURLConnection))throw new Rejected("Незащищённое соединение запрещено");SecureTransport.configure((javax.net.ssl.HttpsURLConnection)h,fingerprint,inspect);h.setConnectTimeout(3000);h.setReadTimeout(12000);h.setInstanceFollowRedirects(false);if(token!=null)h.setRequestProperty("Authorization","Bearer "+token);if(cancellable){active=h;check();}return h;
  }
  public static JSONArray discover(Context c)throws Exception{
    String nonce=UUID.randomUUID().toString().replace("-","");byte[] query=new JSONObject().put("type","luma-discover-v1").put("nonce",nonce).toString().getBytes(StandardCharsets.UTF_8);
    Set<InetAddress> targets=new HashSet<>();targets.add(InetAddress.getByName("255.255.255.255"));
    for(Enumeration<NetworkInterface> all=NetworkInterface.getNetworkInterfaces();all.hasMoreElements();){NetworkInterface n=all.nextElement();if(!n.isUp()||n.isLoopback())continue;for(InterfaceAddress a:n.getInterfaceAddresses())if(local(a.getAddress())&&a.getBroadcast()!=null)targets.add(a.getBroadcast());}
    List<DatagramSocket> sockets=new ArrayList<>();WifiManager.MulticastLock lock=null;Map<String,JSONObject> results=new LinkedHashMap<>();
    try{WifiManager wifi=(WifiManager)c.getApplicationContext().getSystemService(Context.WIFI_SERVICE);if(wifi!=null){lock=wifi.createMulticastLock("luma-discovery");lock.setReferenceCounted(false);lock.acquire();}
      DatagramSocket plain=new DatagramSocket();plain.setBroadcast(true);plain.setSoTimeout(100);sockets.add(plain);
      ConnectivityManager cm=c.getSystemService(ConnectivityManager.class);for(Network n:cm.getAllNetworks()){NetworkCapabilities caps=cm.getNetworkCapabilities(n);if(caps!=null&&caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)&&!caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)){DatagramSocket socket=null;try{socket=new DatagramSocket();n.bindSocket(socket);socket.setBroadcast(true);socket.setSoTimeout(100);sockets.add(socket);LinkProperties lp=cm.getLinkProperties(n);if(lp!=null)for(RouteInfo r:lp.getRoutes())if(r.hasGateway()&&local(r.getGateway()))targets.add(r.getGateway());}catch(Exception ignored){if(socket!=null){sockets.remove(socket);socket.close();}}}}
      long start=android.os.SystemClock.elapsedRealtime(),last=0;while(android.os.SystemClock.elapsedRealtime()-start<4000){check();long now=android.os.SystemClock.elapsedRealtime();if(now-last>=1200){last=now;for(DatagramSocket s:sockets)for(InetAddress target:targets)try{s.send(new DatagramPacket(query,query.length,target,47833));}catch(IOException ignored){}}
        for(DatagramSocket s:sockets)try{byte[] bytes=new byte[2048];DatagramPacket packet=new DatagramPacket(bytes,bytes.length);s.receive(packet);if(!local(packet.getAddress()))continue;JSONObject data=new JSONObject(new String(packet.getData(),0,packet.getLength(),StandardCharsets.UTF_8));String id=data.optString("serverId");int port=data.optInt("port");if(!"luma-server-v1".equals(data.optString("type"))||!nonce.equals(data.optString("nonce"))||!id.matches("[a-f0-9-]{36}")||data.optInt("protocol")!=2||port<1||port>65535)continue;
          data.remove("nonce");data.remove("type");data.put("name",data.optString("name","Компьютер").substring(0,Math.min(80,data.optString("name","Компьютер").length())));data.put("url",SyncService.validateServer("https://"+packet.getAddress().getHostAddress()+":"+port));if(results.size()<32)results.put(id+"|"+data.getString("url"),data);
        }catch(SocketTimeoutException ignored){}catch(JSONException ignored){}catch(SocketException ignored){}
      }
    }finally{for(DatagramSocket s:sockets)s.close();if(lock!=null&&lock.isHeld())lock.release();}
    JSONArray list=new JSONArray();for(JSONObject d:results.values())list.put(d);found=list;discoveryRevision++;return list;
  }
  private static JSONObject json(HttpURLConnection h)throws Exception{
    try{int code=h.getResponseCode();InputStream input=code==200?h.getInputStream():h.getErrorStream();ByteArrayOutputStream out=new ByteArrayOutputStream();if(input!=null)try(InputStream in=input){byte[] b=new byte[2048];int n;while((n=in.read(b))!=-1){check();out.write(b,0,n);if(out.size()>8192)throw new IOException("Некорректный ответ ПК");}}
      JSONObject result=new JSONObject(out.toString("UTF-8"));result.put("_code",code);return result;
    }finally{h.disconnect();}
  }
  private static boolean prove(Context c,JSONObject connection,String server)throws Exception{
    String id=connection.optString("serverId"),nonce=UUID.randomUUID().toString().replace("-","");HttpURLConnection h=open(c,server,"/v1/probe",null);h.setReadTimeout(3000);h.setRequestMethod("POST");h.setDoOutput(true);h.setRequestProperty("Content-Type","application/json");byte[] bytes=new JSONObject().put("deviceId",connection.getString("deviceId")).put("nonce",nonce).toString().getBytes(StandardCharsets.UTF_8);h.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=h.getOutputStream()){out.write(bytes);}JSONObject reply=json(h);
    if(!id.equals(reply.optString("serverId")))return false;
    if(reply.optInt("_code")==401)throw new Rejected("Доступ на ПК отключён. Подключите телефон заново по QR или коду.");
    Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(connection.getString("token").getBytes(StandardCharsets.UTF_8),"HmacSHA256"));byte[] digest=mac.doFinal((id+"|"+connection.getString("deviceId")+"|"+nonce).getBytes(StandardCharsets.UTF_8));StringBuilder proof=new StringBuilder();for(byte b:digest)proof.append(String.format("%02x",b&255));
    if(reply.optInt("_code")!=200||!MessageDigest.isEqual(proof.toString().getBytes(StandardCharsets.UTF_8),reply.optString("proof").getBytes(StandardCharsets.UTF_8)))return false;
    connection.put("server",server).put("serverName",reply.optString("name","Компьютер"));return true;
  }
  private static void save(Context c,JSONObject connection){try{ConnectionSecrets.save(c,connection);Store.revision++;}catch(Exception e){throw new IllegalStateException("Не удалось сохранить защищённое подключение",e);}}
  public static void reconnect(Context c)throws Exception{
    JSONObject connection=Store.connection(c);if(!connection.has("token"))throw new Rejected("Сначала подключите ПК по QR или одноразовому коду.");if(!connection.optString("fingerprint").matches("[a-f0-9]{64}")||!connection.getString("server").startsWith("https://"))throw new Rejected("После обновления нужно один раз подключить ПК заново по QR. Музыка сохранена.");String original=SyncService.validateServer(connection.getString("server"));
    if(!connection.has("serverId")){
      // Migrate an old pairing only at its previously trusted address.
      JSONObject identity=json(open(c,original,"/v1/identity",connection.getString("token")));if(identity.optInt("_code")==200){connection.put("serverId",identity.getString("serverId")).put("serverName",identity.optString("name","Компьютер"));save(c,connection);}else if(identity.optInt("_code")==401)throw new Rejected("Подключите ПК заново по коду.");return;
    }
    try{if(prove(c,connection,original)){save(c,connection);return;}}catch(Rejected e){throw e;}catch(javax.net.ssl.SSLException e){throw new Rejected("Удостоверение ПК не прошло проверку. Соединение остановлено. Проверьте ПК и создайте новое сопряжение.");}catch(Exception ignored){}
    JSONArray candidates=discover(c);String previousHost=new URL(original).getHost();for(int pass=0;pass<2;pass++)for(int i=0;i<candidates.length();i++){check();JSONObject candidate=candidates.getJSONObject(i);if(!connection.getString("serverId").equals(candidate.getString("serverId")))continue;boolean sameHost=previousHost.equals(new URL(candidate.getString("url")).getHost());if((pass==0)!=sameHost)continue;try{if(prove(c,connection,candidate.getString("url"))){save(c,connection);return;}}catch(Rejected e){throw e;}catch(Exception ignored){}}
    throw new Missing("Не видим знакомый ПК. Откройте Tembrival на нём и проверьте Wi-Fi / точку доступа. Если включён VPN, разрешите локальную сеть.");
  }
}
