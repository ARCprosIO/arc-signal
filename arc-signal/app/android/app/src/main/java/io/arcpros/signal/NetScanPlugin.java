package io.arcpros.signal;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.RouteInfo;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.view.WindowManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.io.BufferedReader;
import java.io.FileReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.DatagramPacket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.MulticastSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Native network tools for ARC Signal. Every method returns plain JSON for the web UI.
 * Nothing here needs root. Limits that Android imposes (scan throttling, hidden MAC addresses on
 * newer versions) are reported back to the UI rather than hidden.
 */
@CapacitorPlugin(
    name = "NetScan",
    permissions = { @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION }, alias = "location") }
)
public class NetScanPlugin extends Plugin {

    private final ExecutorService pool = Executors.newCachedThreadPool();

    // ------------------------------------------------------------------ helpers

    private Context ctx() { return getContext().getApplicationContext(); }

    private WifiManager wifi() { return (WifiManager) ctx().getSystemService(Context.WIFI_SERVICE); }

    private ConnectivityManager cm() { return (ConnectivityManager) ctx().getSystemService(Context.CONNECTIVITY_SERVICE); }

    private boolean hasLocationPermission() { return getPermissionState("location") == PermissionState.GRANTED; }

    private boolean locationServicesOn() {
        try {
            LocationManager lm = (LocationManager) ctx().getSystemService(Context.LOCATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 28) return lm.isLocationEnabled();
            return lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception e) { return true; }
    }

    /** Link properties of the Wi-Fi network (preferred) or the active network. */
    private LinkProperties linkProps() {
        ConnectivityManager c = cm();
        try {
            for (Network n : c.getAllNetworks()) {
                NetworkCapabilities nc = c.getNetworkCapabilities(n);
                if (nc != null && nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                    LinkProperties lp = c.getLinkProperties(n);
                    if (lp != null) return lp;
                }
            }
            Network a = c.getActiveNetwork();
            return a == null ? null : c.getLinkProperties(a);
        } catch (Exception e) { return null; }
    }

    private JSObject lanInfoObj() {
        JSObject o = new JSObject();
        LinkProperties lp = linkProps();
        if (lp == null) return o;
        for (LinkAddress la : lp.getLinkAddresses()) {
            if (la.getAddress() instanceof Inet4Address) { o.put("ip", la.getAddress().getHostAddress()); o.put("prefix", la.getPrefixLength()); break; }
        }
        for (RouteInfo r : lp.getRoutes()) {
            if (r.isDefaultRoute() && r.getGateway() instanceof Inet4Address) { o.put("gateway", r.getGateway().getHostAddress()); break; }
        }
        JSArray dns = new JSArray();
        for (InetAddress d : lp.getDnsServers()) if (d instanceof Inet4Address) dns.put(d.getHostAddress());
        o.put("dns", dns);
        o.put("iface", lp.getInterfaceName());
        return o;
    }

    private static String security(String caps) {
        if (caps == null) return "";
        boolean sae = caps.contains("SAE"), psk = caps.contains("PSK"), eap = caps.contains("EAP");
        boolean wpa2 = caps.contains("WPA2") || caps.contains("RSN"), wpa = caps.contains("WPA-") || (caps.contains("WPA") && !wpa2 && !sae);
        String s;
        if (sae && psk) s = "WPA2/WPA3";
        else if (sae) s = "WPA3-SAE";
        else if (wpa2) s = eap ? "WPA2-EAP" : "WPA2-PSK";
        else if (wpa) s = "WPA";
        else if (caps.contains("WEP")) s = "WEP";
        else if (caps.contains("OWE")) s = "OWE";
        else return "OPEN";
        if (caps.contains("TKIP") && !caps.contains("CCMP")) s += "-TKIP";
        return s;
    }

    private static int widthMhz(int w) {
        switch (w) { case 0: return 20; case 1: return 40; case 2: return 80; case 3: return 160; case 4: return 80; case 5: return 320; default: return 20; }
    }

    private static String standardName(int s) {
        switch (s) {
            case 1: return "Legacy (a/b/g)"; case 4: return "Wi-Fi 4 (802.11n)"; case 5: return "Wi-Fi 5 (802.11ac)";
            case 6: return "Wi-Fi 6 (802.11ax)"; case 7: return "WiGig (802.11ad)"; case 8: return "Wi-Fi 7 (802.11be)";
            default: return "";
        }
    }

    private static List<Integer> intList(JSArray a, int fallbackMax) {
        List<Integer> out = new ArrayList<>();
        if (a != null) for (int i = 0; i < a.length() && out.size() < 4096; i++) { try { out.add(a.getInt(i)); } catch (Exception ignored) { } }
        return out;
    }

    // ------------------------------------------------------------------ keep awake / permissions state

    @PluginMethod
    public void keepAwake(final PluginCall call) {
        final boolean on = call.getBoolean("on", true);
        getActivity().runOnUiThread(new Runnable() {
            public void run() {
                if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        });
        call.resolve();
    }

    // ------------------------------------------------------------------ Wi-Fi

    @PluginMethod
    @SuppressWarnings("deprecation")
    public void wifiInfo(PluginCall call) {
        JSObject o = new JSObject();
        try {
            WifiManager wm = wifi();
            boolean locOn = locationServicesOn();
            o.put("locationOn", locOn);
            o.put("permission", hasLocationPermission());
            WifiInfo wi = wm.getConnectionInfo();
            if (wi != null && wi.getNetworkId() != -1) {
                String ssid = wi.getSSID();
                if (ssid != null) ssid = ssid.replace("\"", "");
                if (ssid == null || ssid.equals("<unknown ssid>")) ssid = hasLocationPermission() && locOn ? "(hidden)" : null;
                o.put("ssid", ssid);
                o.put("bssid", wi.getBSSID());
                o.put("rssi", wi.getRssi());
                o.put("linkSpeed", wi.getLinkSpeed());
                o.put("frequency", wi.getFrequency());
                if (Build.VERSION.SDK_INT >= 29) { o.put("txLinkSpeed", wi.getTxLinkSpeedMbps()); o.put("rxLinkSpeed", wi.getRxLinkSpeedMbps()); }
                if (Build.VERSION.SDK_INT >= 30) o.put("standard", standardName(wi.getWifiStandard()));
                if (hasLocationPermission() && wi.getBSSID() != null) {
                    for (ScanResult r : wm.getScanResults()) if (wi.getBSSID().equalsIgnoreCase(r.BSSID)) { o.put("width", widthMhz(r.channelWidth)); break; }
                }
            }
            JSObject l = lanInfoObj();
            for (java.util.Iterator<String> it = l.keys(); it.hasNext(); ) { String k = it.next(); o.put(k, l.get(k)); }
        } catch (Exception e) { o.put("error", String.valueOf(e.getMessage())); }
        call.resolve(o);
    }

    @PluginMethod
    public void lanInfo(PluginCall call) { call.resolve(lanInfoObj()); }

    @PluginMethod
    @SuppressWarnings("deprecation")
    public void wifiScan(final PluginCall call) {
        if (!hasLocationPermission()) { call.reject("Location permission is required to scan Wi-Fi networks."); return; }
        pool.submit(new Runnable() {
            public void run() {
                try {
                    final WifiManager wm = wifi();
                    final CountDownLatch latch = new CountDownLatch(1);
                    BroadcastReceiver rcv = new BroadcastReceiver() { public void onReceive(Context c, Intent i) { latch.countDown(); } };
                    ctx().registerReceiver(rcv, new IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION));
                    boolean started = false;
                    try { started = wm.startScan(); if (started) latch.await(5, TimeUnit.SECONDS); } finally { try { ctx().unregisterReceiver(rcv); } catch (Exception ignored) { } }
                    JSArray arr = new JSArray();
                    for (ScanResult r : wm.getScanResults()) {
                        JSObject n = new JSObject();
                        String ssid = r.SSID == null ? "" : r.SSID;
                        n.put("ssid", ssid);
                        n.put("bssid", r.BSSID == null ? "" : r.BSSID.toLowerCase());
                        n.put("level", r.level);
                        n.put("frequency", r.frequency);
                        n.put("width", widthMhz(r.channelWidth));
                        n.put("capabilities", r.capabilities);
                        String sec = security(r.capabilities);
                        n.put("security", sec);
                        n.put("open", sec.equals("OPEN"));
                        n.put("center", r.centerFreq0);
                        try {
                            if (Build.VERSION.SDK_INT >= 30) { int std = r.getWifiStandard(); if (std > 0) n.put("standard", standardName(std)); }
                            if (Build.VERSION.SDK_INT >= 30 && r.getInformationElements() != null) {
                                for (ScanResult.InformationElement ie : r.getInformationElements()) {
                                    int id = ie.getId();
                                    java.nio.ByteBuffer b = ie.getBytes();
                                    if (id == 11 && b.remaining() >= 5) { n.put("stations", (b.get(0) & 0xff) | ((b.get(1) & 0xff) << 8)); n.put("util", b.get(2) & 0xff); }   // BSS Load
                                    else if (id == 70) n.put("k", true);        // RM Enabled Capabilities (802.11k)
                                    else if (id == 54) n.put("r", true);        // Mobility Domain (802.11r)
                                    else if (id == 127 && b.remaining() >= 3) { if ((b.get(2) & 0x08) != 0) n.put("v", true); }   // Extended Capabilities, bit 19 = BSS Transition (802.11v)
                                }
                                if (!n.has("k")) n.put("k", false); if (!n.has("v")) n.put("v", false); if (!n.has("r")) n.put("r", false);
                            }
                        } catch (Throwable t) { /* optional extras only */ }
                        arr.put(n);
                    }
                    JSObject res = new JSObject();
                    res.put("networks", arr);
                    res.put("throttled", !started);
                    call.resolve(res);
                } catch (Exception e) { call.reject("Scan failed: " + e.getMessage()); }
            }
        });
    }

    // ------------------------------------------------------------------ ping / traceroute (system ping binary, no root)

    private static final Pattern RE_TIME = Pattern.compile("time[=<]([0-9.]+)\\s*ms");
    private static final Pattern RE_FROM = Pattern.compile("[Ff]rom\\s+(\\d+\\.\\d+\\.\\d+\\.\\d+)");

    private String runPing(String host, int ttl, int waitSec, long timeoutMs) {
        Process p = null;
        try {
            List<String> cmd = new ArrayList<>();
            cmd.add("/system/bin/ping"); cmd.add("-c"); cmd.add("1"); cmd.add("-W"); cmd.add(String.valueOf(waitSec));
            if (ttl > 0) { cmd.add("-t"); cmd.add(String.valueOf(ttl)); }
            cmd.add(host);
            p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
            BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream()));
            StringBuilder sb = new StringBuilder(); String line;
            long end = System.currentTimeMillis() + timeoutMs;
            while ((line = br.readLine()) != null) { sb.append(line).append('\n'); if (System.currentTimeMillis() > end) break; }
            p.waitFor(300, TimeUnit.MILLISECONDS);
            return sb.toString();
        } catch (Exception e) { return null; }
        finally { if (p != null) p.destroy(); }
    }

    /** Returns rtt ms or -1. Falls back to a TCP/isReachable probe if the ping binary is unavailable. */
    private double pingOnce(String host, int timeoutMs) {
        String out = runPing(host, 0, Math.max(1, timeoutMs / 1000), timeoutMs + 800L);
        if (out != null) {
            Matcher m = RE_TIME.matcher(out);
            if (m.find()) return Double.parseDouble(m.group(1));
            if (out.contains("unknown host") || out.contains("Network is unreachable")) return -1;
            return -1;
        }
        long t = System.nanoTime();
        try { if (InetAddress.getByName(host).isReachable(timeoutMs)) return (System.nanoTime() - t) / 1e6; } catch (Exception ignored) { }
        return -1;
    }

    @PluginMethod
    public void ping(final PluginCall call) {
        final String host = call.getString("host");
        final int count = Math.max(1, Math.min(20, call.getInt("count", 1)));
        final int timeout = call.getInt("timeout", 1000);
        if (host == null || !host.matches("[A-Za-z0-9.\\-]+")) { call.reject("bad host"); return; }
        pool.submit(new Runnable() {
            public void run() {
                JSArray rtts = new JSArray();
                for (int i = 0; i < count; i++) {
                    try { rtts.put(pingOnce(host, timeout)); } catch (Exception e) { rtts.put(-1); }
                    if (count > 1) { try { Thread.sleep(200); } catch (InterruptedException ignored) { } }
                }
                JSObject r = new JSObject(); r.put("rtts", rtts); call.resolve(r);
            }
        });
    }

    @PluginMethod
    public void traceroute(final PluginCall call) {
        final String host = call.getString("host", "1.1.1.1");
        final int max = Math.max(3, Math.min(30, call.getInt("maxHops", 12)));
        if (!host.matches("[A-Za-z0-9.\\-]+")) { call.reject("bad host"); return; }
        pool.submit(new Runnable() {
            public void run() {
                JSArray hops = new JSArray();
                for (int ttl = 1; ttl <= max; ttl++) {
                    long t = System.nanoTime();
                    String out = runPing(host, ttl, 1, 2500);
                    double rtt = (System.nanoTime() - t) / 1e6;
                    JSObject h = new JSObject(); h.put("ttl", ttl);
                    boolean reached = false;
                    if (out != null) {
                        Matcher tm = RE_TIME.matcher(out); if (tm.find()) rtt = Double.parseDouble(tm.group(1));
                        Matcher fm = RE_FROM.matcher(out);
                        if (fm.find()) { h.put("ip", fm.group(1)); h.put("rtt", rtt); } else { h.put("ip", ""); h.put("rtt", -1); }
                        reached = out.contains("bytes from") && !out.contains("exceeded");
                    } else { h.put("ip", ""); h.put("rtt", -1); }
                    hops.put(h);
                    if (reached) break;
                }
                JSObject r = new JSObject(); r.put("hops", hops); call.resolve(r);
            }
        });
    }

    // ------------------------------------------------------------------ TCP probing and banners

    /** 1 = open, 0 = refused (host alive), -1 = no answer. */
    private int tcpProbe(String ip, int port, int timeoutMs) {
        Socket s = new Socket();
        try { s.connect(new InetSocketAddress(ip, port), timeoutMs); return 1; }
        catch (ConnectException e) { String m = String.valueOf(e.getMessage()); return m.contains("refused") || m.contains("ECONNREFUSED") ? 0 : -1; }
        catch (Exception e) { return -1; }
        finally { try { s.close(); } catch (Exception ignored) { } }
    }

    private String grabBanner(String ip, int port, int timeoutMs) {
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(ip, port), timeoutMs);
            s.setSoTimeout(500);
            boolean http = port == 80 || port == 8080 || port == 8000 || port == 8008 || port == 8888 || port == 5000 || port == 9000 || port == 49152;
            if (port == 443 || port == 8443 || port == 993 || port == 995) return "";
            if (http) {
                OutputStream os = s.getOutputStream();
                os.write(("HEAD / HTTP/1.0\r\nHost: " + ip + "\r\nUser-Agent: Signal\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                os.flush();
            }
            InputStream is = s.getInputStream();
            byte[] buf = new byte[512]; int n = is.read(buf);
            if (n <= 0) return "";
            String txt = new String(buf, 0, n, StandardCharsets.ISO_8859_1).replaceAll("[^\\x20-\\x7E\\r\\n]", "");
            if (http) {
                for (String line : txt.split("\r?\n")) if (line.toLowerCase().startsWith("server:") || line.toLowerCase().startsWith("www-authenticate:")) return line.trim();
                return txt.split("\r?\n")[0].trim();
            }
            return txt.split("\r?\n")[0].trim();
        } catch (Exception e) { return ""; }
        finally { try { s.close(); } catch (Exception ignored) { } }
    }

    @PluginMethod
    public void portScan(final PluginCall call) {
        final String host = call.getString("host");
        final int timeout = Math.max(150, Math.min(3000, call.getInt("timeout", 500)));
        final List<Integer> ports = intList(call.getArray("ports"), 1024);
        if (host == null || !host.matches("\\d+\\.\\d+\\.\\d+\\.\\d+")) { call.reject("host must be an IPv4 address"); return; }
        pool.submit(new Runnable() {
            public void run() {
                ExecutorService ex = Executors.newFixedThreadPool(64);
                final List<JSObject> open = Collections.synchronizedList(new ArrayList<JSObject>());
                List<Future<?>> fs = new ArrayList<>();
                for (final int port : ports) {
                    fs.add(ex.submit(new Runnable() {
                        public void run() {
                            if (tcpProbe(host, port, timeout) == 1) {
                                JSObject o = new JSObject(); o.put("port", port); o.put("banner", grabBanner(host, port, timeout)); open.add(o);
                            }
                        }
                    }));
                }
                for (Future<?> f : fs) { try { f.get(60, TimeUnit.SECONDS); } catch (Exception ignored) { } }
                ex.shutdownNow();
                List<JSObject> sorted = new ArrayList<>(open);
                Collections.sort(sorted, new java.util.Comparator<JSObject>() { public int compare(JSObject a, JSObject b) { return Integer.compare(a.optInt("port"), b.optInt("port")); } });
                JSArray arr = new JSArray(); for (JSObject o : sorted) arr.put(o);
                JSObject r = new JSObject(); r.put("open", arr); call.resolve(r);
            }
        });
    }

    // ------------------------------------------------------------------ LAN discovery

    /** MAC addresses from the kernel ARP table. Android 10+ blocks this for many apps; returns empty then. */
    private Map<String, String> readArp() {
        Map<String, String> m = new HashMap<>();
        try (BufferedReader br = new BufferedReader(new FileReader("/proc/net/arp"))) {
            String line; br.readLine();
            while ((line = br.readLine()) != null) {
                String[] p = line.trim().split("\\s+");
                if (p.length >= 4 && !p[3].equals("00:00:00:00:00:00") && !p[2].equals("0x0")) m.put(p[0], p[3].toLowerCase());
            }
        } catch (Exception ignored) { }
        return m;
    }

    /** SSDP/UPnP: devices that answer give a friendly SERVER string. */
    private Map<String, String> ssdp() {
        Map<String, String> m = new HashMap<>();
        WifiManager.MulticastLock lock = null;
        MulticastSocket s = null;
        try {
            lock = wifi().createMulticastLock("arcsignal"); lock.setReferenceCounted(false); lock.acquire();
            s = new MulticastSocket(); s.setSoTimeout(400);
            byte[] q = ("M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 1\r\nST: ssdp:all\r\n\r\n").getBytes(StandardCharsets.US_ASCII);
            s.send(new DatagramPacket(q, q.length, InetAddress.getByName("239.255.255.250"), 1900));
            long end = System.currentTimeMillis() + 2200;
            byte[] buf = new byte[2048];
            while (System.currentTimeMillis() < end) {
                try {
                    DatagramPacket p = new DatagramPacket(buf, buf.length); s.receive(p);
                    String ip = p.getAddress().getHostAddress(), txt = new String(p.getData(), 0, p.getLength(), StandardCharsets.ISO_8859_1);
                    for (String line : txt.split("\r?\n")) if (line.toLowerCase().startsWith("server:")) { m.put(ip, line.substring(7).trim()); break; }
                    if (!m.containsKey(ip)) m.put(ip, "UPnP device");
                } catch (java.net.SocketTimeoutException ignored) { }
            }
        } catch (Exception ignored) { }
        finally { try { if (s != null) s.close(); } catch (Exception ignored) { } try { if (lock != null && lock.isHeld()) lock.release(); } catch (Exception ignored) { } }
        return m;
    }

    @PluginMethod
    public void lanScan(final PluginCall call) {
        final List<Integer> probePorts = intList(call.getArray("ports"), 16);
        if (probePorts.isEmpty()) { probePorts.add(80); probePorts.add(443); probePorts.add(22); probePorts.add(445); probePorts.add(62078); }
        pool.submit(new Runnable() {
            public void run() {
                try {
                    JSObject li = lanInfoObj();
                    String myIp = li.optString("ip", "");
                    int prefix = li.optInt("prefix", 24);
                    if (myIp.isEmpty()) { call.reject("Not connected to a Wi-Fi/LAN network."); return; }
                    if (prefix < 22) prefix = 22;           // never sweep more than 1022 hosts
                    String[] oc = myIp.split("\\.");
                    long ipn = (Long.parseLong(oc[0]) << 24) | (Long.parseLong(oc[1]) << 16) | (Long.parseLong(oc[2]) << 8) | Long.parseLong(oc[3]);
                    long mask = (0xFFFFFFFFL << (32 - prefix)) & 0xFFFFFFFFL, net = ipn & mask, bcast = net | (~mask & 0xFFFFFFFFL);
                    final List<String> hosts = new ArrayList<>();
                    for (long a = net + 1; a < bcast; a++) hosts.add(((a >> 24) & 255) + "." + ((a >> 16) & 255) + "." + ((a >> 8) & 255) + "." + (a & 255));

                    final Map<String, String> upnp = ssdp();
                    final List<JSObject> found = Collections.synchronizedList(new ArrayList<JSObject>());
                    final AtomicInteger done = new AtomicInteger(0);
                    final int total = hosts.size();
                    final String self = myIp;
                    ExecutorService ex = Executors.newFixedThreadPool(48);
                    final ExecutorService dnsEx = Executors.newFixedThreadPool(8);
                    List<Future<?>> fs = new ArrayList<>();
                    for (final String ip : hosts) {
                        fs.add(ex.submit(new Runnable() {
                            public void run() {
                                try {
                                    double rtt = ip.equals(self) ? 0.1 : pingOnce(ip, 1000);
                                    boolean alive = rtt >= 0;
                                    JSArray open = new JSArray();
                                    for (int port : probePorts) {
                                        int r = tcpProbe(ip, port, alive ? 300 : 150);
                                        if (r >= 0) alive = true;
                                        if (r == 1) open.put(port);
                                    }
                                    if (alive) {
                                        JSObject d = new JSObject(); d.put("ip", ip); d.put("rtt", rtt); d.put("ports", open);
                                        if (ip.equals(self)) d.put("name", "This phone");
                                        else {
                                            Future<String> f = dnsEx.submit(new java.util.concurrent.Callable<String>() { public String call()throws Exception { return InetAddress.getByName(ip).getCanonicalHostName(); } });
                                            try { String n = f.get(1200, TimeUnit.MILLISECONDS); if (n != null && !n.equals(ip)) d.put("name", n.replaceAll("\\.(lan|local|home|localdomain)$", "")); } catch (Exception ignored) { f.cancel(true); }
                                        }
                                        if (upnp.containsKey(ip)) d.put("banner", upnp.get(ip));
                                        found.add(d);
                                        JSObject ev = new JSObject(); ev.put("device", d); ev.put("progress", done.get() / (double) total);
                                        notifyListeners("deviceFound", ev);
                                    }
                                } catch (Exception ignored) { }
                                done.incrementAndGet();
                            }
                        }));
                    }
                    for (Future<?> f : fs) { try { f.get(90, TimeUnit.SECONDS); } catch (Exception ignored) { } }
                    ex.shutdownNow(); dnsEx.shutdownNow();
                    Map<String, String> arp = readArp();
                    List<JSObject> out = new ArrayList<>(found);
                    for (JSObject d : out) { String mac = arp.get(d.optString("ip")); if (mac != null) d.put("mac", mac); }
                    JSArray arr = new JSArray(); for (JSObject d : out) arr.put(d);
                    JSObject r = new JSObject(); r.put("devices", arr); r.put("macsAvailable", !arp.isEmpty()); r.put("subnet", myIp + "/" + prefix);
                    call.resolve(r);
                } catch (Exception e) { call.reject("Scan failed: " + e.getMessage()); }
            }
        });
    }
}
