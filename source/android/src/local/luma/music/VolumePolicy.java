package local.luma.music;
import org.json.JSONObject;
final class VolumePolicy {
 private static double clamp(double value){return Double.isFinite(value)?Math.max(0,Math.min(1,value)):1;}
 static double gain(JSONObject settings,JSONObject track){JSONObject volumes=settings.optJSONObject("trackVolumes");double local=track==null||volumes==null?1:volumes.optDouble(track.optString("id"),1);return clamp(local)*clamp(settings.optDouble("masterVolume",1));}
}
