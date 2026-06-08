# Diagnostics evidence — host-inaudible-remote-audio (session 11ee886f-0ceb-4179-8a9e-a7d26ae84e0f, 2026-06-08)

Participants: silverjrom (JROM/host, PH 180.191.73.157) | peer2 (Minisforum Win+ext-mic, US) | Phone Peer2 (Android, US 100.16.57.177)
Publisher id prefixes: peer2=5429774b  PhonePeer2=5bd47c7c  silverjrom=c933e511
Topology: Cloudflare Calls SFU (single PC per client, cfSessionId per client).

## JROM (host) inbound AUDIO subscriptions over time (the smoking gun)
```
t(UTC)    from       bytesRecv pktRecv pktLost
00:24:45  (no inbound audio tracks)
00:24:52  (no inbound audio tracks)
00:25:00  (no inbound audio tracks)
00:25:07  (no inbound audio tracks)
00:25:15  (no inbound audio tracks)
00:25:23  (no inbound audio tracks)
00:25:30  5429774b   2762      38      0
00:25:37  5429774b   24746     414     0
00:25:45  5429774b   45793     788     0
00:25:52  5429774b   62910     1162    0
00:26:00  5429774b   80917     1542    0
00:26:07  5429774b   99755     1912    0
00:26:15  5429774b   119713    2286    0
00:26:22  5429774b   136878    2663    0
00:26:30  5429774b   156377    3036    0
00:26:37  5429774b   175177    3414    0
00:26:45  5429774b   194108    3791    0
00:26:52  (no inbound audio tracks)
00:27:00  5bd47c7c   11106     223     0
00:27:07  5bd47c7c   21906     523     0
00:27:15  5bd47c7c   38145     899     0
00:27:22  5bd47c7c   53192     1274    0
00:27:30  5bd47c7c   71365     1647    0
00:27:37  5bd47c7c   86132     2024    0
```

## Per-participant latest snapshot (out/in tracks)
```
== silverjrom plat=? micSilent=True outLvl=0.009 outEnergy=3.47 conn=connected rtt=18 local=srflx remote=host
   OUT audio bytesSent=678895 pktSent=8928
   OUT video bytesSent=8745730 pktSent=8071
   OUT video bytesSent=2602959 pktSent=6835
   OUT video bytesSent=26032067 pktSent=22691
   IN  audio bytesRecv=86132 pktRecv=2024 pktLost=0 audioLevel=None totEnergy=None concealed=0 from=5bd47c7c

== Phone Peer2 plat=android micSilent=True outLvl=0.000 outEnergy=1.16 conn=connected rtt=9 local=srflx remote=host
   OUT audio bytesSent=89435 pktSent=2078
   OUT video bytesSent=0 pktSent=0
   OUT video bytesSent=0 pktSent=0
   OUT video bytesSent=0 pktSent=0
   IN  audio bytesRecv=153295 pktRecv=2038 pktLost=0 audioLevel=0 totEnergy=None concealed=0 from=c933e511
   IN  video bytesRecv=4739097 pktRecv=4174 pktLost=0 audioLevel=None totEnergy=None concealed=None from=c933e511

== peer2 plat=desktop micSilent=True outLvl=0.000 outEnergy=0.66 conn=connected rtt=10 local=srflx remote=host
   OUT audio bytesSent=202933 pktSent=3945
   OUT video bytesSent=0 pktSent=0
   OUT video bytesSent=0 pktSent=0
   OUT video bytesSent=0 pktSent=0
   IN  audio bytesRecv=283815 pktRecv=3827 pktLost=0 audioLevel=0 totEnergy=None concealed=1929 from=c933e511
   IN  video bytesRecv=11421692 pktRecv=9967 pktLost=0 audioLevel=None totEnergy=None concealed=None from=c933e511

```

## Read of the evidence
1. Host receives clean inbound audio RTP from BOTH publishers (0 loss) yet hears neither → fault is HOST-SIDE PLAYOUT (subscribe→track-routing→mixer→sink), not network/SFU-forwarding.
2. Host holds only ONE inbound audio track at a time (R2 anomaly): peer2 until ~08:26:45, gap, then phone. Never concurrent.
3. inbound audioLevel/totalAudioEnergy are null → R3 gap; cannot yet prove decode vs sink from data.
