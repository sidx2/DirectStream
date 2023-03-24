// Every user that is going to connect to agora.io will have a unique user id
const uid = String(Math.floor(Math.random() * 1e9));
// console.log("uid: ", uid);

// getting url parameter and returning user back to lobby if he doent have roomId
const queryString = window.location.search
const urlParams = new URLSearchParams(queryString)
const roomId = urlParams.get('room')

if (!roomId) window.location = 'lobby.html';

// Creating client of channel objects of agora.io
let client;
let channel;

// local user and remote user streams
let localStream;
let remoteStream;
let peerConnection;

const servers = {
    iceServers: [{
        urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"]
    }]
}

const userVideoPlayer = document.getElementById("user-1")

const init = async() => {
    // instantiating the client and channel objects from agora.io
    client = await AgoraRTM.createInstance(APP_ID)
    await client.login({ uid, TOEKN })

    channel = client.createChannel(roomId)
    await channel.join()

    // whenever a new user joins
    channel.on("MemberJoined", handleUserJoined)
    channel.on("MemberLeft", handleUserLeft)
    client.on("MessageFromPeer", handleMessageFromPeer);

    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    userVideoPlayer.srcObject = localStream


}

const handleUserJoined = async(MemberId) => {
    createOffer(MemberId);
    // console.log(MemberId, "Has joined");
}

const handleUserLeft = async() => {
    document.getElementById("user-2").style.display = 'none'
}
const handleMessageFromPeer = async(message, MemberId) => {
    message = await JSON.parse(message.text);
    // console.log(`${MemberId} sent: `, message)

    // if we recieve the 'offer', we will create the 'answer' using it
    if (message.type == "offer") {
        createAnswer(MemberId, message.offer)
    }

    /* couple of things here
    1) first of all, the user-1 is creating a offer and sending it using agora signaling
    2) second, we are recieving the offer from the user-1
    3) then, we are setting RemoteDescription and LocalDescription of the user-2
    4) After that, we are sending asnwer from user-2
    5) then, we need to handle that in user-1
    */
    if (message.type == "answer") {
        addAnswer(message.answer)
    }

    // if we are recieving the ice candidates, we will add the ice candidates to out 'peerConnection'
    if (message.type == "candidate") {
        if (peerConnection && message.candidate) peerConnection.addIceCandidate(message.candidate)
    }
}

const createPeerConnection = async(MemberId) => {
    peerConnection = new RTCPeerConnection(servers);

    // setting the remoteStream to the empty MediaStream
    remoteStream = new MediaStream();
    document.getElementById("user-2").srcObject = remoteStream;
    document.getElementById("user-2").style.display = 'block';

    if (!localStream) {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        userVideoPlayer.srcObject = localStream
    }
    // adding all localStream tracks to the peerConnection object
    localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream)
    })

    // whenever the user-2 joins, we will add his tracks to the remoteStream object
    peerConnection.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
            remoteStream.addTrack(track)
        })
    }

    // whenever we have new icecandidate (whatever that means)
    peerConnection.onicecandidate = async(event) => {
        if (event.candidate) {
            // console.log("New icecandidate: ", event.candidate)
            // sending the icecandidates the to newly joined user
            client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'candidate', "candidate": event.candidate }) }, MemberId);
        }
    }
}

const createOffer = async(MemberId) => {
    await createPeerConnection(MemberId)

    // create the offer and set the setLocalDescription to offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer)

    // console.log("offer", offer)
    // we want to send the offer to the newly joined user
    client.sendMessageToPeer({ text: JSON.stringify({ "type": 'offer', 'offer': offer }) }, MemberId);
}

const createAnswer = async(MemberId, offer) => {
    await createPeerConnection(MemberId)

    // setting the remote description to the offer
    await peerConnection.setRemoteDescription(offer)

    // creating the answer to send back to the first user
    const answer = await peerConnection.createAnswer()

    // for the second user the RemoteDescription is 'offer' and LocalDescription is 'answer'
    await peerConnection.setLocalDescription(answer)

    // sending the 'answer' to the first user
    client.sendMessageToPeer({ text: JSON.stringify({ "type": 'answer', 'answer': answer }) }, MemberId);

}

const addAnswer = async(answer) => {
    if (!peerConnection.currentRemoteDescription) {
        peerConnection.setRemoteDescription(answer)
    }
}

// whenever the user leave, we need to do the following cleanup
const leaveChannel = async() => {
    channel.leave()
    client.logout()
}

const camera = document.getElementById("camera")
const mic = document.getElementById("mic")

camera.addEventListener("click", () => {
    const videoTrack = localStream.getTracks().find(track => track.kind === 'video')

    if (videoTrack.enabled) {
        videoTrack.enabled = false;
        camera.style.backgroundColor = 'red'
    } else {

        videoTrack.enabled = true;
        camera.style.backgroundColor = 'rgba(255,255,255,0.2)'
    }
})

mic.addEventListener("click", () => {
    const audioTrack = localStream.getTracks().find(track => track.kind === 'audio')

    if (audioTrack.enabled) {
        audioTrack.enabled = false;
        mic.style.backgroundColor = 'red'
    } else {

        audioTrack.enabled = true;
        mic.style.backgroundColor = 'rgba(255,255,255,0.2)'
    }
})
window.addEventListener("beforeunload", leaveChannel)
init()