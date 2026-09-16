# Phase 2B comparison

- Previous fake/controller oracle: 36/36 deterministic model cases PASS.
- This run: real Windows executable, real bundled libmpv and real inherited stdio pipes.
- START_FILE and END_FILE use native playlist_entry_id.
- FILE_LOADED is accepted only with one unique open playlist entry mapping.
- Property/core-idle events use mpv_observe_property reply_userdata mapped to generation.
- COMMAND_REPLY remains command-layer acknowledgement and is not media-loaded/playing evidence.
- No production source, Emby server, renderer, PlaybackManager, Session, Resolver or WebSocket was used.
