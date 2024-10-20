const Hyperswarm = require('hyperswarm');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const DHT = require('@hyperswarm/dht'); // Local DHT node for testing

class Auction extends EventEmitter {
  constructor() {
    super();
    this.peerId = crypto.randomBytes(8).toString('hex');
    this.dht = new DHT(); // Local DHT node
    this.swarm = new Hyperswarm({ dht: this.dht });
    this.items = {}; // Map of itemId to item
    this.peers = []; // List of connected peers
    this.init();
  }

  init() {
    // Generate a topic for discovery
    const topic = crypto.createHash('sha256').update('p2p-auction').digest();

    this.swarm.join(topic, {
      lookup: true, // Find and connect to peers
      announce: true, // Announce ourselves to the DHT
    });

    this.swarm.on('connection', (socket, details) => {
      const remotePublicKeyHex = socket.remotePublicKey.toString('hex');
      console.log(`New peer connected: ${remotePublicKeyHex}`);
      this.peers.push(socket);
      this.emit('peer-connected', remotePublicKeyHex);

      socket.on('data', (data) => {
        const message = JSON.parse(data.toString());
        this.handleMessage(message, socket);
      });

      socket.on('close', () => {
        console.log('Peer disconnected');
        this.peers = this.peers.filter((s) => s !== socket);
      });

      // Request items from the new peer
      socket.write(JSON.stringify({ type: 'request-items', peerId: this.peerId }));
    });

    this.swarm.flush().then(() => {
      // Emitted when the swarm has finished bootstrapping
      this.emit('ready');
    });
  }

  start() {
    console.log('Auction started. Peer ID:', this.peerId);
  }

  broadcast(message, excludeSocket) {
    const data = JSON.stringify(message);
    this.peers.forEach((socket) => {
      if (socket !== excludeSocket) {
        socket.write(data);
      }
    });
  }

  addItem(item) {
    this.items[item.id] = item;
    console.log(`Item added: ${item.name}`);
    this.broadcast({ type: 'new-item', item, peerId: this.peerId });
    this.emit('item-added', item);
  }

  bidOnItem(itemId, bidAmount) {
    const item = this.items[itemId];
    if (!item) {
      console.log('Item not found');
      return;
    }
    if (bidAmount <= item.currentBid) {
      console.log('Bid too low');
      return;
    }
    item.currentBid = bidAmount;
    item.highestBidder = this.peerId;
    console.log(`Placed bid on item ${itemId}: ${bidAmount}`);
    this.broadcast({ type: 'new-bid', itemId, bidAmount, peerId: this.peerId });
    this.emit('bid-placed', { itemId, bidAmount });
  }

  handleMessage(message, socket) {
    if (message.peerId === this.peerId) {
      return; // Ignore messages from self
    }

    switch (message.type) {
      case 'new-item':
        if (!this.items[message.item.id]) {
          this.items[message.item.id] = message.item;
          console.log(`New item received: ${message.item.name}`);
          this.emit('item-received', message.item);
        }
        break;

      case 'new-bid':
        const item = this.items[message.itemId];
        if (item && message.bidAmount > item.currentBid) {
          item.currentBid = message.bidAmount;
          item.highestBidder = message.peerId;
          console.log(`New bid on item ${message.itemId}: ${message.bidAmount}`);
          this.emit('bid-received', { itemId: message.itemId, bidAmount: message.bidAmount });
        }
        break;

      case 'request-items':
        socket.write(
          JSON.stringify({ type: 'items-list', items: Object.values(this.items), peerId: this.peerId })
        );
        break;

      case 'items-list':
        message.items.forEach((item) => {
          if (!this.items[item.id]) {
            this.items[item.id] = item;
          }
        });
        console.log(`Received ${message.items.length} items from peer`);
        this.emit('items-received', message.items);
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }
}

module.exports = Auction;
