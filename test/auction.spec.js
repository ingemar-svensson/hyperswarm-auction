const Auction = require('../src/auction');
const Item = require('../src/item');

jest.setTimeout(300000); // Increase timeout for networking tests

describe('Auction', () => {
  let auction1;
  let auction2;
  let auction3;

  beforeAll(async () => {
    auction1 = new Auction();
    auction2 = new Auction();

    // Wait until both swarms are ready
    await Promise.all([
      new Promise((resolve) => auction1.once('ready', resolve)),
      new Promise((resolve) => auction2.once('ready', resolve)),
    ]);
  });

  afterAll(() => {
    auction1.swarm.destroy();
    auction2.swarm.destroy();
    if (auction3) auction3.swarm.destroy();
    auction1.dht.destroy();
    auction2.dht.destroy();
    if (auction3) auction3.dht.destroy();
  });

  test('should connect two peers', (done) => {
    let peersConnected = 0;

    function checkDone() {
      if (peersConnected === 2) {
        expect(auction1.peers.length).toBeGreaterThan(0);
        expect(auction2.peers.length).toBeGreaterThan(0);
        done();
      }
    }

    auction1.once('peer-connected', () => {
      peersConnected += 1;
      checkDone();
    });

    auction2.once('peer-connected', () => {
      peersConnected += 1;
      checkDone();
    });
  });

  test('should share new items between peers', (done) => {
    const item = new Item('item1', 'Rare Coin', 'A very rare coin', 100);

    auction2.once('item-received', (receivedItem) => {
      expect(receivedItem.id).toBe('item1');
      expect(receivedItem.name).toBe('Rare Coin');
      done();
    });

    auction1.addItem(item);
  });

  test('should update bids across peers', (done) => {
    auction1.once('bid-received', ({ itemId, bidAmount }) => {
      expect(itemId).toBe('item1');
      expect(bidAmount).toBe(150);
      expect(auction1.items[itemId].currentBid).toBe(150);
      expect(auction1.items[itemId].highestBidder).toBe(auction2.peerId);
      done();
    });

    auction2.bidOnItem('item1', 150);
  });

  test('new peer should receive existing items', async (done) => {
    auction3 = new Auction();

    await new Promise((resolve) => auction3.once('ready', resolve));

    auction3.once('items-received', (items) => {
      expect(items.length).toBeGreaterThan(0);
      expect(auction3.items['item1']).toBeDefined();
      expect(auction3.items['item1'].name).toBe('Rare Coin');
      done();
    });
  });
});
