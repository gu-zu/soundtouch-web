const st = require("../st/main"),
    path = require("path"),
    express = require('express'),
    { Server } = require('socket.io'),
    app = express(),
    server = require('http').createServer(app),
    io = new Server(server);

// Express simply accepts a string like this :)
const cacheOpt = { 'maxAge': "5 days" }
// Serve homepage depending on device type
app.get("/", (req, res) =>
    res.sendFile(path.join(__dirname + "/assets/index" + ((req.headers['user-agent'].includes("Mobile")) ? "_mobile" : "") + ".html"), cacheOpt)
)
// Isn't used but might be useful to force a specific version of the page
app.get("/mobile", (req, res) => res.sendFile(path.join(__dirname + "/assets/index_mobile.html"), cacheOpt))
app.get("/desktop", (req, res) => res.sendFile(path.join(__dirname + "/assets/index.html"), cacheOpt))
// Serve assets
app.use(express.static(path.join(__dirname + "/assets"), { 'maxAge': "30 days" }))

server.listen(3456, () => {
    console.log("listening")
})

// Handle socket.io sockets
io.on("connection", (socket) => {
    // Construct speakers variable, describing speaker details.
    // Then send to newly connected client
    const speakers = []
    for (const speaker of st.speakers)
        speakers.push({ ip: speaker.ip, name: speaker.name, img: speaker.img })
    socket.emit("speakers", speakers)

    // Logic for selecting a speaker
    let selected;
    socket.on("select", (id) => {
        if (!st.speakers[id] && !selected) return socket.emit("err", "speaker bestaat niet");
        end()
        selected = id
        if (!selected) return

        st.startListen(selected, (err, res) => {
            if (err) return socket.emit("err", err.message);
            st.now_playing(selected, (err, res) => { if (err) return socket.emit("err", err.message); socket.emit("now_playing", res) })
            st.volume(selected, (err, res) => { if (err) return socket.emit("err", err.message); socket.emit("volume", res) })
            st.presets(selected, (err, res) => { if (err) return socket.emit("err", err.message); socket.emit("presets", res) })
            st.eventListen(selected, "volumeUpdated", socket.id, (ev) => socket.emit("volume", ev))
            st.eventListen(selected, "presetsUpdated", socket.id, (ev) => socket.emit("presets", ev))
            st.eventListen(selected, "nowPlayingUpdated", socket.id, (ev) => socket.emit("now_playing", ev))
        })
    })

    // Handle speaker "keys"
    socket.on("key", (key) => { if (selected) st.key(selected, key, mcb) })
    socket.on('volume', (num) => { if (selected) st.volume(selected, mcb, num) })
    socket.on('seek', (sec) => { if (selected) st.seek(selected, sec, mcb) })
    function mcb(err, res) {
        if (err) socket.emit("err", err.message)
    }

    // Free resources if no client is listening
    socket.on('disconnect', end)
    function end() {
        if (selected) st.endListen(selected, socket.id) // this will also close soundtouch connection if no listeners are left
    }
})