/* What causes bad Wi-Fi: symptom -> cause engine and a plain checklist library. */
(function (root) {
  const SYMPTOMS = [
    ['slow', 'Slow everywhere'], ['slowfar', 'Slow only far from router'], ['slownight', 'Slow in the evening'],
    ['drops', 'Drops / disconnects'], ['dropsmin', 'Drops about every minute or hour'], ['calls', 'Video calls freeze or robot voice'],
    ['games', 'Gaming lag spikes'], ['onedev', 'Only one device has trouble'], ['all', 'Every device has trouble'],
    ['wired', 'Wired devices also affected'], ['wifionly', 'Wired is fine, Wi-Fi is bad'], ['rooms', 'Dead spots / certain rooms'],
    ['2g', 'Stuck on 2.4 GHz'], ['connected', 'Connected but no internet'], ['reboot', 'Fixed by rebooting, then returns'],
    ['weather', 'Worse when raining / certain times'], ['mirror', 'Router near mirrors, metal, fish tank or appliances'], ['stacked', 'Multiple routers / extenders']
  ];
  /* w = weights per symptom id. test = where in this app to confirm. */
  const CAUSES = [
    { id: 'stack', title: 'Routers stacked or too close together', sev: 2, w: { stacked: 4, slow: 1, drops: 1, calls: 1, games: 1, rooms: 1 },
      why: 'Two transmitters side by side hear each other on the same channel and take turns, halving capacity. Stacking a router on a modem/router combo also couples noise into both.',
      fix: ['Keep access points 3 m or more apart (more if on the same channel).', 'Never stack routers or put one on top of the modem.', 'Use one router and add wired access points on different channels instead of extenders.'], test: 'Wi-Fi tab: look for "very strong access points on the same channel".' },
    { id: 'dnat', title: 'Double NAT (two routers routing)', sev: 2, w: { stacked: 3, games: 3, calls: 1, connected: 1 },
      why: 'ISP gateway plus your own router both route. Breaks port forwarding, adds latency, hurts gaming and VoIP.',
      fix: ['Put the ISP gateway in bridge / IP-passthrough mode.', 'Or switch the second router to Access Point mode: DHCP off, cable into a LAN port.'], test: 'Wi-Fi tab > Network checks > Trace route (app).' },
    { id: 'mirror', title: 'Reflective and absorbing surfaces near the router', sev: 1, w: { mirror: 4, rooms: 2, slowfar: 1 },
      why: 'Mirrors and metal reflect 2.4/5 GHz signals into multipath that cancels itself out; aquariums, brick, concrete, foil insulation and appliances absorb them. Signal drops 3-20 dB behind them.',
      fix: ['Move the router to a central, elevated, open spot, 1-2 m off the floor.', 'Keep it 1 m or more from mirrors, TV, fish tanks, metal shelving and cordless phone bases.', 'Never put it inside a cabinet, behind a TV or in the basement corner.'], test: 'Survey tab: walk the house and compare rooms.' },
    { id: 'micro', title: 'Microwave, baby monitor, Bluetooth or cordless interference on 2.4 GHz', sev: 1, w: { dropsmin: 2, drops: 1, mirror: 1, slow: 1, '2g': 1 },
      why: 'The 2.4 GHz band is shared with microwaves, Bluetooth, wireless cameras, baby monitors, ZigBee and USB 3.0 hubs (which leak noise right at 2.4 GHz).',
      fix: ['Move devices to 5 GHz where possible.', 'Move USB 3 hubs and external drives away from the router and laptop.', 'Compare speed with the microwave running.'], test: 'Live tab: watch jitter while the suspect device runs.' },
    { id: 'chan', title: 'Channel congestion from neighbours', sev: 1, w: { slownight: 4, slow: 2, calls: 1, games: 1, '2g': 1 },
      why: 'Every network on your channel shares the same airtime. Evenings are worst. Using channels 2,3,4,5,7,8,9,10 on 2.4 GHz makes it worse because they overlap two or three neighbours at once.',
      fix: ['2.4 GHz: use 1, 6 or 11 only, 20 MHz wide.', '5 GHz: 80 MHz or less; pick the least used block.', 'Prefer 5/6 GHz; turn off auto channel if it keeps hopping and dropping.'], test: 'Wi-Fi tab: scan and read the channel advice.' },
    { id: 'weak', title: 'Weak signal / too far / too many walls', sev: 2, w: { slowfar: 4, rooms: 3, slow: 1, drops: 1, onedev: 1 },
      why: 'Below -70 dBm the radio drops to slow data rates and retries constantly. 5 GHz loses range faster through walls than 2.4.',
      fix: ['Add a wired access point or mesh node halfway to the dead spot.', 'Do not use cheap repeaters with a single radio: they halve throughput.', 'Test with the Survey tab in each room.'], test: 'Survey tab, and RSSI on Live tab.' },
    { id: 'dfs', title: 'DFS radar channel hopping', sev: 1, w: { dropsmin: 4, drops: 2, weather: 2 },
      why: 'Channels 52-144 must be vacated when the router thinks it sees radar, causing a 1-minute outage. Common near airports, weather radar and in storms.',
      fix: ['Set 5 GHz to channels 36-48 or 149-165.', 'Check router logs for "radar detected".'], test: 'Wi-Fi tab shows if your channel is DFS.' },
    { id: 'band', title: 'Sticky clients and band steering problems', sev: 1, w: { '2g': 4, slowfar: 1, onedev: 1, rooms: 1 },
      why: 'Phones cling to the first AP/band they joined, even when a better one is in range. Same SSID on separate routers makes it worse.',
      fix: ['Give 2.4 and 5 GHz distinct SSIDs for stubborn devices.', 'On mesh/multi-AP systems enable 802.11k/v/r.', 'Lower the 2.4 GHz TX power so 5 GHz is preferred.'], test: 'Wi-Fi tab: connected band.' },
    { id: 'client', title: 'One bad client (old driver, power saving, bad antenna)', sev: 1, w: { onedev: 5, wifionly: 1 },
      why: 'A single device with a faulty Wi-Fi card or old 802.11b/g speed can slow the whole cell, and poor drivers disconnect on wake.',
      fix: ['Update OS and Wi-Fi driver; forget and re-join the network.', 'Disable Wi-Fi power saving; try a USB adapter to prove the card.', 'Check the device on a different network.'], test: 'Devices tab: compare latency per device.' },
    { id: 'bloat', title: 'Bufferbloat (router queue fills under load)', sev: 2, w: { calls: 3, games: 3, slownight: 1, slow: 1 },
      why: 'When someone uploads or downloads, the modem/router queue fills and every other connection waits. Idle speed tests look fine, calls fall apart.',
      fix: ['Enable SQM / smart queue (fq_codel or CAKE) and shape to ~90% of line speed.', 'Replace ISP gateway with a router that supports SQM.'], test: 'Speed tab: bufferbloat grade.' },
    { id: 'line', title: 'ISP line noise or low signal (cable/DSL/fibre)', sev: 3, w: { wired: 5, all: 2, drops: 2, weather: 3, dropsmin: 1, reboot: 1 },
      why: 'Bad coax connectors, water in a splitter, damaged drop or a failing amplifier cause uncorrectable errors and "intermittent" outages that Wi-Fi tuning cannot fix. Worse in rain/heat.',
      fix: ['Read modem signal levels (Modem tab): SNR 33+ dB, DS power -7..+7, US 38-48.', 'Replace splitters and tighten/replace every coax connector; remove unused splitters.', 'Capture the log and ask for a line test or tech visit with the numbers.'], test: 'Modem tab and Live tab with wired connection.' },
    { id: 'gw', title: 'Failing router, modem or power adapter', sev: 2, w: { reboot: 4, wired: 2, all: 2, drops: 2, dropsmin: 1 },
      why: 'Overheating, failing capacitors, memory leaks and old firmware make routers degrade until rebooted. Weak power adapters cause reboots under load.',
      fix: ['Update firmware; check the router is not hot and has airflow.', 'Swap the power adapter for a known good one of the same rating.', 'Replace routers older than 5-6 years.'], test: 'Live tab: router outage pattern in the Log.' },
    { id: 'cable', title: 'Bad Ethernet cable or port', sev: 1, w: { wired: 3, onedev: 2, wifionly: -3 },
      why: 'Cat5 or damaged cables negotiate 100 Mbps or flap. A pinched cable causes intermittent loss.',
      fix: ['Try another cable and another switch/router port.', 'Check the link speed shows 1 Gbps.'], test: 'Live tab on a wired client.' },
    { id: 'dns', title: 'Slow or failing DNS', sev: 1, w: { connected: 4, slow: 1, reboot: 1 },
      why: 'Pages hang before loading and "connected, no internet" appears when the ISP resolver is slow or down.',
      fix: ['Use 1.1.1.1 or 8.8.8.8 on the router.', 'Run the DNS race in the app and compare.'], test: 'Speed tab: DNS race.' },
    { id: 'many', title: 'Too many devices or chatty IoT', sev: 1, w: { slownight: 2, slow: 1, all: 1, drops: 1 },
      why: 'Cheap routers choke on hundreds of connections; cameras uploading 24/7 saturate uplink.',
      fix: ['Check Devices tab for unknown or heavy devices.', 'Put IoT on a guest/IoT SSID.', 'Upgrade to a router with a faster CPU.'], test: 'Devices tab.' },
    { id: 'rogue', title: 'Rogue / unauthorised access point or user', sev: 3, w: { slow: 1, all: 1, drops: 1, stacked: 1 },
      why: 'Someone plugging an unmanaged router into a wall jack (second DHCP), an evil-twin SSID or a stranger on the guest network all cause weird, intermittent problems.',
      fix: ['Scan Wi-Fi for duplicate SSIDs with different security.', 'Look for two DHCP servers; unplug unknown routers.', 'Change the Wi-Fi password; enable WPA3/WPA2-AES.'], test: 'Wi-Fi tab findings and Devices tab.' },
    { id: 'power', title: 'Transmit power set to max (louder than the clients)', sev: 1, w: { slowfar: 2, onedev: 1, rooms: 1 },
      why: 'A router can hear far, but phones can only transmit weakly. Max power means clients see full bars yet cannot reply.',
      fix: ['Lower the router TX power one step.', 'Add more APs at medium power rather than one at maximum.'], test: 'Compare phone RSSI with speed.' },
    { id: 'chanwidth', title: '40/80/160 MHz channels in a crowded space', sev: 1, w: { slownight: 2, drops: 1, slow: 1 },
      why: 'Wide channels give higher peak speed but overlap more neighbours and are fragile.',
      fix: ['2.4 GHz: 20 MHz. 5 GHz: 40 or 80 MHz in apartments.'], test: 'Wi-Fi tab: width of your network.' }
  ];
  const BASICS = [
    ['Router placement', 'Central, high, open, away from walls and metal. Antennas: one vertical, one horizontal on older routers.'],
    ['Stacked equipment', 'Never stack router on modem on switch. Heat and coupled radio noise hurt all of them.'],
    ['Mirrors, aquariums, appliances', 'Reflect or absorb radio. Keep 1 m clear.'],
    ['Floors and walls', 'Concrete, brick, plaster-and-lath, metal studs and foil insulation can cost 10-20 dB each.'],
    ['Extenders', 'A one-radio repeater halves throughput. Prefer wired AP or tri-band mesh with wired backhaul.'],
    ['Firmware', 'Update the router; disable WPS and UPnP if unused.'],
    ['Cables and splitters', 'Replace old coax, remove unused splitters, tighten connectors finger-tight plus a quarter turn.']
  ];
  const api = {
    SYMPTOMS, CAUSES, BASICS,
    rank(selected) {
      return CAUSES.map(c => ({ c, score: selected.reduce((s, id) => s + (c.w[id] || 0), 0) }))
        .filter(x => x.score > 0).sort((a, b) => b.score - a.score || b.c.sev - a.c.sev);
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KB = api;
})(typeof window !== 'undefined' ? window : globalThis);
