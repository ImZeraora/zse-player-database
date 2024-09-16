const fetch = require("node-fetch");
const dotenv = require("dotenv");

dotenv.config(); // Load environment variables from .env

// Informationen zu deinem Repository und Datei
const owner = "ImpactCoding"; // GitHub Username oder Organisation
const repo = "rr-player-database"; // Repository Name
const path = "rr-players.json"; // Pfad zur Datei, die du ändern möchtest
const branch = "main"; // Branch, auf dem die Änderungen stattfinden sollen
const token = process.env.ACCESS_TOKEN; // Use GitHub token from environment variables
let sha;

const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

async function refreshPlayerDatabase() {
  const oldPlayerData = await downloadFile();
  const currentPlayerData = await fetchRooms();
  const currentPlayerDataWithMiis = await fetchMiis(currentPlayerData);
  const updatedPlayerData = insertCurrentPlayerData(
    oldPlayerData,
    currentPlayerDataWithMiis
  );
  updatedPlayerData.last_refresh = Date.now();

  uploadFile(updatedPlayerData);
}

async function downloadFile() {
  // get sha
  const fileResponse = await fetch(fileUrl, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  const fileData = await fileResponse.json();
  sha = fileData.sha;

  const response = await fetch(
    "https://impactcoding.github.io/rr-player-database/rr-players.json"
  );
  const playerData = await response.json();
  return playerData;
}

async function uploadFile(fileToUpload) {
  const updatedContent = Buffer.from(
    JSON.stringify(fileToUpload, null, 2),
    "utf-8"
  ).toString("base64");

  const updateResponse = await fetch(fileUrl, {
    method: "PUT",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: "Updated rr-players.json: Added new entry",
      content: updatedContent, // The new updated content (Base64-encoded)
      sha: sha, // SHA to overwrite the file
      branch: branch,
    }),
  });

  if (!updateResponse.ok) {
    throw new Error(`Error updating file: ${updateResponse.statusText}`);
  }

  const result = await updateResponse.json();
  console.log("File updated successfully:", result);
}

async function fetchRooms() {
  const response = await fetch("https://umapyoi.net/api/v1/rr-rooms");
  const rooms = await response.json();
  let players = [];

  rooms.forEach((room) => {
    players.push(...Object.values(room.players));
  });

  players = players.filter(
    (player) => player.ev !== undefined && player.ev !== null
  );

  return players;
}

async function fetchMiis(playerData) {
  const miiDataList = [];
  playerData.forEach((player) => {
    if (player.mii) miiDataList.push(player.mii[0].data);
  });

  const mii_data_response = await fetch("https://umapyoi.net/api/v1/mii", {
    method: "POST",
    body: JSON.stringify(miiDataList),
  });

  if (!mii_data_response.ok) {
    console.log("Error fetching Mii data from umapyoi.net");
    return;
  }

  const mii_dict = await mii_data_response.json();

  var mii_arr = Object.keys(mii_dict).map((key) => mii_dict[key]);

  playerData.forEach((player) => {
    if (player.mii) player.mii[0].data = mii_dict[player.mii[0].data];
  });

  return playerData;
}

function insertCurrentPlayerData(oldData, roomsData) {
  roomsData.forEach((player) => {
    if (oldData.hasOwnProperty(player.fc)) {
      if (!player.banned) {
        const oldVR = oldData[player.fc].ev;
        const newVR = player.ev;

        if (newVR == 30000 && !oldData[player].first_max_vr) {
          player.first_max_vr = Date.now();
        }

        if (Math.abs(oldVR - newVR) > 1000) {
          player.banned = true;
          player.ban_date = Date.now();
        } else player.banned = false;
      }
    } else {
      if (player.ev > 30000) {
        player.banned = true;
        player.ban_date = Date.now();
      } else {
        player.banned = false;
      }
    }

    if (!player.banned) player.lastupdated = Date.now();
    oldData[player.fc] = player;
  });

  return oldData;
}

refreshPlayerDatabase();
let iterations = setInterval(refreshPlayerDatabase, 180000); // Call the function every 180 seconds (3 minutes)
setTimeout(() => clearInterval(iterations), 3600000); // Stop after 3600000 ms (1 hour)
