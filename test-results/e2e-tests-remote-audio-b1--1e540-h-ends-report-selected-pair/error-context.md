# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/tests/remote-audio/b1-remote-join.spec.ts >> B1: remote join (creepy-mini) + host admit + both-ends ICE pair >> remote guest knocks over public tunnel, host admits, both ends report selected pair
- Location: e2e/tests/remote-audio/b1-remote-join.spec.ts:93:3

# Error details

```
Error: Channel closed
```

# Page snapshot

```yaml
- main [ref=e4]:
  - region "Call" [ref=e5]:
    - generic:
      - generic "Call controls":
        - generic [ref=e6]:
          - generic "RA-B1-1781924986747-coh7a" [ref=e7]
          - generic [ref=e8]:
            - generic "Meeting elapsed time" [ref=e9]: 2:43
            - 'img "Connection: Route: direct | RTT: 7 ms | Loss: n/a | Jitter: n/a" [ref=e10]'
        - generic "Primary call controls" [ref=e11]:
          - generic [ref=e12]:
            - button "Mute microphone" [pressed] [ref=e13] [cursor=pointer]:
              - img [ref=e14]:
                - img [ref=e16]
            - button "Microphone device settings" [ref=e19] [cursor=pointer]:
              - img [ref=e20]:
                - img [ref=e22]
          - generic [ref=e24]:
            - button "Turn camera on" [ref=e25] [cursor=pointer]:
              - img [ref=e26]:
                - img [ref=e28]
            - button "Camera device settings" [ref=e31] [cursor=pointer]:
              - img [ref=e32]:
                - img [ref=e34]
          - button "Share screen" [ref=e36] [cursor=pointer]:
            - img [ref=e37]:
              - img [ref=e39]
          - button "Record" [ref=e43] [cursor=pointer]:
            - img [ref=e44]:
              - img [ref=e46]
          - button "Settings" [ref=e49] [cursor=pointer]:
            - img [ref=e50]:
              - img [ref=e52]
          - generic [ref=e54]:
            - button "Mute meeting speakers" [ref=e55] [cursor=pointer]:
              - img [ref=e56]:
                - img [ref=e58]
            - button "Speaker volume" [ref=e60] [cursor=pointer]:
              - img [ref=e61]:
                - img [ref=e63]
          - button "Reactions" [ref=e66] [cursor=pointer]:
            - img [ref=e67]:
              - img [ref=e69]
          - button "Leave call" [ref=e74] [cursor=pointer]:
            - img [ref=e75]:
              - img [ref=e77]
        - generic "Meeting tools" [ref=e79]:
          - button "Show chat" [ref=e80] [cursor=pointer]:
            - img [ref=e81]:
              - img [ref=e83]
          - button "Hide participants" [active] [pressed] [ref=e85] [cursor=pointer]:
            - img [ref=e86]:
              - img [ref=e88]
            - generic [ref=e93]: "1"
    - status [ref=e94]: You are host.
    - generic [ref=e95]:
      - generic "Participants" [ref=e96]:
        - article [ref=e98]:
          - generic [ref=e99]:
            - generic [ref=e101]: HO
            - generic:
              - generic:
                - generic: HOST
              - generic:
                - generic: host
                - generic: local
      - complementary "Participants" [ref=e103]:
        - generic [ref=e105]:
          - heading "Participants" [level=2] [ref=e106]
          - paragraph [ref=e107]: 1 in the call
        - region "In the call" [ref=e108]:
          - heading "In the call" [level=3] [ref=e109]
          - list [ref=e110]:
            - listitem [ref=e111]:
              - generic [ref=e112]: HO
              - generic [ref=e113]:
                - generic [ref=e114]: host
                - generic [ref=e115]: HOST
              - generic "Media state" [ref=e116]:
                - img [ref=e117]:
                  - img [ref=e119]
                - img [ref=e122]:
                  - img [ref=e124]
        - region "Waiting to join" [ref=e127]:
          - heading "Waiting to join" [level=3] [ref=e129]
          - paragraph [ref=e130]: No one is waiting.
```