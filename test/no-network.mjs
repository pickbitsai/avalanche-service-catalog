// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import net from 'node:net';
import dgram from 'node:dgram';
import { syncBuiltinESMExports } from 'node:module';
const blocked = () => { throw new Error('Tests must not bind ports or access the network'); };
net.Server.prototype.listen = blocked;
net.Socket.prototype.connect = blocked;
dgram.Socket.prototype.bind = blocked;
dgram.Socket.prototype.send = blocked;
globalThis.fetch = blocked;
syncBuiltinESMExports();
