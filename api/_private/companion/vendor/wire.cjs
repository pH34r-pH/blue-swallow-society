/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-mixed-operators, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars, default-case, jsdoc/require-param*/
"use strict";

var $protobuf = require("protobufjs/minimal");

var $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;
var $Object = $util.global.Object, $undefined = $util.global.undefined, $Error = $util.global.Error, $RangeError = $util.global.RangeError;

var $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

$root.blueswallow = (function() {

    var blueswallow = {};

    blueswallow.vnext = (function() {

        var vnext = {};

        vnext.sync = (function() {

            var sync = {};

            sync.v1 = (function() {

                var v1 = {};

                v1.DatasetDelta = (function() {

                    var DatasetDelta = function (properties) {
                        this.observations = [];
                        this.events = [];
                        this.retractions = [];
                        if (properties)
                            for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                    this[keys[i]] = properties[keys[i]];
                    };

                    DatasetDelta.prototype.schemaVersion = 0;
                    DatasetDelta.prototype.groupId = "";
                    DatasetDelta.prototype.publisherDeviceId = "";
                    DatasetDelta.prototype.batchId = "";
                    DatasetDelta.prototype.sessionId = "";
                    DatasetDelta.prototype.observations = $util.emptyArray;
                    DatasetDelta.prototype.events = $util.emptyArray;
                    DatasetDelta.prototype.finalPart = false;
                    DatasetDelta.prototype.closedControlSequence = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                    DatasetDelta.prototype.retractions = $util.emptyArray;
                    DatasetDelta.prototype.recordScope = "";

                    DatasetDelta.encode = function (message, writer, _depth) {
                        if (!writer)
                            writer = $Writer.create();
                        if (_depth === $undefined)
                            _depth = 0;
                        if (_depth > $util.recursionLimit)
                            throw $Error("max depth exceeded");
                        if (message.schemaVersion != null && $Object.hasOwnProperty.call(message, "schemaVersion") && message.schemaVersion !== 0)
                            writer.uint32(8).uint32(message.schemaVersion);
                        if (message.groupId != null && $Object.hasOwnProperty.call(message, "groupId") && message.groupId !== "")
                            writer.uint32(18).string(message.groupId);
                        if (message.publisherDeviceId != null && $Object.hasOwnProperty.call(message, "publisherDeviceId") && message.publisherDeviceId !== "")
                            writer.uint32(26).string(message.publisherDeviceId);
                        if (message.batchId != null && $Object.hasOwnProperty.call(message, "batchId") && message.batchId !== "")
                            writer.uint32(34).string(message.batchId);
                        if (message.sessionId != null && $Object.hasOwnProperty.call(message, "sessionId") && message.sessionId !== "")
                            writer.uint32(42).string(message.sessionId);
                        if (message.observations != null && message.observations.length)
                            for (var i = 0; i < message.observations.length; ++i)
                                writer.uint32(50).bytes(message.observations[i]);
                        if (message.events != null && message.events.length)
                            for (var i = 0; i < message.events.length; ++i)
                                writer.uint32(58).bytes(message.events[i]);
                        if (message.finalPart != null && $Object.hasOwnProperty.call(message, "finalPart") && message.finalPart !== false)
                            writer.uint32(64).bool(message.finalPart);
                        if (message.closedControlSequence != null && $Object.hasOwnProperty.call(message, "closedControlSequence") && (typeof message.closedControlSequence === "object" ? message.closedControlSequence.low || message.closedControlSequence.high : message.closedControlSequence !== 0))
                            writer.uint32(72).uint64(message.closedControlSequence);
                        if (message.retractions != null && message.retractions.length)
                            for (var i = 0; i < message.retractions.length; ++i)
                                $root.blueswallow.vnext.sync.v1.DatasetRetraction.encode(message.retractions[i], writer.uint32(82).fork(), _depth + 1).ldelim();
                        if (message.recordScope != null && $Object.hasOwnProperty.call(message, "recordScope") && message.recordScope !== "")
                            writer.uint32(90).string(message.recordScope);
                        if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                            for (var i = 0; i < message.$unknowns.length; ++i)
                                writer.raw(message.$unknowns[i]);
                        return writer;
                    };

                    DatasetDelta.decode = function (reader, length, _end, _depth, _target) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        if (_depth === $undefined)
                            _depth = 0;
                        if (_depth > $Reader.recursionLimit)
                            throw $Error("max depth exceeded");
                        var end, message, value;
                        if (length === $undefined)
                            end = reader.len;
                        else {
                            end = reader.pos + length;
                            if (end > reader.len)
                                throw $RangeError("index out of range");
                            length = reader.len;
                            reader.len = end;
                        }
                        message = _target || new $root.blueswallow.vnext.sync.v1.DatasetDelta();
                        while (reader.pos < end) {
                            var start = reader.pos;
                            var tag = reader.tag();
                            if (tag === _end) {
                                _end = $undefined;
                                break;
                            }
                            var wireType = tag & 7;
                            switch (tag >>>= 3) {
                            case 1: {
                                    if (wireType !== 0)
                                        break;
                                    if (value = reader.uint32())
                                        message.schemaVersion = value;
                                    else
                                        delete message.schemaVersion;
                                    continue;
                                }
                            case 2: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.groupId = value;
                                    else
                                        delete message.groupId;
                                    continue;
                                }
                            case 3: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.publisherDeviceId = value;
                                    else
                                        delete message.publisherDeviceId;
                                    continue;
                                }
                            case 4: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.batchId = value;
                                    else
                                        delete message.batchId;
                                    continue;
                                }
                            case 5: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.sessionId = value;
                                    else
                                        delete message.sessionId;
                                    continue;
                                }
                            case 6: {
                                    if (wireType !== 2)
                                        break;
                                    if (!(message.observations && message.observations.length))
                                        message.observations = [];
                                    message.observations.push(reader.bytes());
                                    continue;
                                }
                            case 7: {
                                    if (wireType !== 2)
                                        break;
                                    if (!(message.events && message.events.length))
                                        message.events = [];
                                    message.events.push(reader.bytes());
                                    continue;
                                }
                            case 8: {
                                    if (wireType !== 0)
                                        break;
                                    if (value = reader.bool())
                                        message.finalPart = value;
                                    else
                                        delete message.finalPart;
                                    continue;
                                }
                            case 9: {
                                    if (wireType !== 0)
                                        break;
                                    if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                        message.closedControlSequence = value;
                                    else
                                        delete message.closedControlSequence;
                                    continue;
                                }
                            case 10: {
                                    if (wireType !== 2)
                                        break;
                                    if (!(message.retractions && message.retractions.length))
                                        message.retractions = [];
                                    message.retractions.push($root.blueswallow.vnext.sync.v1.DatasetRetraction.decode(reader, reader.size(), $undefined, _depth + 1));
                                    continue;
                                }
                            case 11: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.recordScope = value;
                                    else
                                        delete message.recordScope;
                                    continue;
                                }
                            }
                            reader.skipType(wireType, _depth, tag);
                            if (!reader.discardUnknown) {
                                $util.makeProp(message, "$unknowns", false);
                                (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                            }
                        }
                        if (length !== $undefined) {
                            if (reader.pos !== end)
                                throw $RangeError("index out of range");
                            reader.len = length;
                        }
                        if (_end !== $undefined)
                            throw $Error("missing end group");
                        return message;
                    };

                    return DatasetDelta;
                })();

                v1.DatasetRetraction = (function() {

                    var DatasetRetraction = function (properties) {
                        if (properties)
                            for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                    this[keys[i]] = properties[keys[i]];
                    };

                    DatasetRetraction.prototype.id = "";
                    DatasetRetraction.prototype.targetObservationId = "";

                    DatasetRetraction.encode = function (message, writer, _depth) {
                        if (!writer)
                            writer = $Writer.create();
                        if (_depth === $undefined)
                            _depth = 0;
                        if (_depth > $util.recursionLimit)
                            throw $Error("max depth exceeded");
                        if (message.id != null && $Object.hasOwnProperty.call(message, "id") && message.id !== "")
                            writer.uint32(10).string(message.id);
                        if (message.targetObservationId != null && $Object.hasOwnProperty.call(message, "targetObservationId") && message.targetObservationId !== "")
                            writer.uint32(18).string(message.targetObservationId);
                        if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                            for (var i = 0; i < message.$unknowns.length; ++i)
                                writer.raw(message.$unknowns[i]);
                        return writer;
                    };

                    DatasetRetraction.decode = function (reader, length, _end, _depth, _target) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        if (_depth === $undefined)
                            _depth = 0;
                        if (_depth > $Reader.recursionLimit)
                            throw $Error("max depth exceeded");
                        var end, message, value;
                        if (length === $undefined)
                            end = reader.len;
                        else {
                            end = reader.pos + length;
                            if (end > reader.len)
                                throw $RangeError("index out of range");
                            length = reader.len;
                            reader.len = end;
                        }
                        message = _target || new $root.blueswallow.vnext.sync.v1.DatasetRetraction();
                        while (reader.pos < end) {
                            var start = reader.pos;
                            var tag = reader.tag();
                            if (tag === _end) {
                                _end = $undefined;
                                break;
                            }
                            var wireType = tag & 7;
                            switch (tag >>>= 3) {
                            case 1: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.id = value;
                                    else
                                        delete message.id;
                                    continue;
                                }
                            case 2: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.targetObservationId = value;
                                    else
                                        delete message.targetObservationId;
                                    continue;
                                }
                            }
                            reader.skipType(wireType, _depth, tag);
                            if (!reader.discardUnknown) {
                                $util.makeProp(message, "$unknowns", false);
                                (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                            }
                        }
                        if (length !== $undefined) {
                            if (reader.pos !== end)
                                throw $RangeError("index out of range");
                            reader.len = length;
                        }
                        if (_end !== $undefined)
                            throw $Error("missing end group");
                        return message;
                    };

                    return DatasetRetraction;
                })();

                v1.DatasetCommit = (function() {

                    var DatasetCommit = function (properties) {
                        if (properties)
                            for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                    this[keys[i]] = properties[keys[i]];
                    };

                    DatasetCommit.prototype.schemaVersion = 0;
                    DatasetCommit.prototype.groupId = "";
                    DatasetCommit.prototype.publisherDeviceId = "";
                    DatasetCommit.prototype.sequence = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                    DatasetCommit.prototype.previousCommitSha256 = "";
                    DatasetCommit.prototype.deltaSha256 = "";
                    DatasetCommit.prototype.deltaSize = 0;
                    DatasetCommit.prototype.batchId = "";
                    DatasetCommit.prototype.sessionId = "";
                    DatasetCommit.prototype.finalPart = false;
                    DatasetCommit.prototype.observationCount = 0;
                    DatasetCommit.prototype.eventCount = 0;
                    DatasetCommit.prototype.closedControlSequence = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                    DatasetCommit.prototype.retractionCount = 0;
                    DatasetCommit.prototype.recordScope = "";

                    DatasetCommit.encode = function (message, writer, _depth) {
                        if (!writer)
                            writer = $Writer.create();
                        if (_depth === $undefined)
                            _depth = 0;
                        if (_depth > $util.recursionLimit)
                            throw $Error("max depth exceeded");
                        if (message.schemaVersion != null && $Object.hasOwnProperty.call(message, "schemaVersion") && message.schemaVersion !== 0)
                            writer.uint32(8).uint32(message.schemaVersion);
                        if (message.groupId != null && $Object.hasOwnProperty.call(message, "groupId") && message.groupId !== "")
                            writer.uint32(18).string(message.groupId);
                        if (message.publisherDeviceId != null && $Object.hasOwnProperty.call(message, "publisherDeviceId") && message.publisherDeviceId !== "")
                            writer.uint32(26).string(message.publisherDeviceId);
                        if (message.sequence != null && $Object.hasOwnProperty.call(message, "sequence") && (typeof message.sequence === "object" ? message.sequence.low || message.sequence.high : message.sequence !== 0))
                            writer.uint32(32).uint64(message.sequence);
                        if (message.previousCommitSha256 != null && $Object.hasOwnProperty.call(message, "previousCommitSha256") && message.previousCommitSha256 !== "")
                            writer.uint32(42).string(message.previousCommitSha256);
                        if (message.deltaSha256 != null && $Object.hasOwnProperty.call(message, "deltaSha256") && message.deltaSha256 !== "")
                            writer.uint32(50).string(message.deltaSha256);
                        if (message.deltaSize != null && $Object.hasOwnProperty.call(message, "deltaSize") && message.deltaSize !== 0)
                            writer.uint32(56).uint32(message.deltaSize);
                        if (message.batchId != null && $Object.hasOwnProperty.call(message, "batchId") && message.batchId !== "")
                            writer.uint32(66).string(message.batchId);
                        if (message.sessionId != null && $Object.hasOwnProperty.call(message, "sessionId") && message.sessionId !== "")
                            writer.uint32(74).string(message.sessionId);
                        if (message.finalPart != null && $Object.hasOwnProperty.call(message, "finalPart") && message.finalPart !== false)
                            writer.uint32(80).bool(message.finalPart);
                        if (message.observationCount != null && $Object.hasOwnProperty.call(message, "observationCount") && message.observationCount !== 0)
                            writer.uint32(88).uint32(message.observationCount);
                        if (message.eventCount != null && $Object.hasOwnProperty.call(message, "eventCount") && message.eventCount !== 0)
                            writer.uint32(96).uint32(message.eventCount);
                        if (message.closedControlSequence != null && $Object.hasOwnProperty.call(message, "closedControlSequence") && (typeof message.closedControlSequence === "object" ? message.closedControlSequence.low || message.closedControlSequence.high : message.closedControlSequence !== 0))
                            writer.uint32(104).uint64(message.closedControlSequence);
                        if (message.retractionCount != null && $Object.hasOwnProperty.call(message, "retractionCount") && message.retractionCount !== 0)
                            writer.uint32(112).uint32(message.retractionCount);
                        if (message.recordScope != null && $Object.hasOwnProperty.call(message, "recordScope") && message.recordScope !== "")
                            writer.uint32(122).string(message.recordScope);
                        if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                            for (var i = 0; i < message.$unknowns.length; ++i)
                                writer.raw(message.$unknowns[i]);
                        return writer;
                    };

                    DatasetCommit.decode = function (reader, length, _end, _depth, _target) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        if (_depth === $undefined)
                            _depth = 0;
                        if (_depth > $Reader.recursionLimit)
                            throw $Error("max depth exceeded");
                        var end, message, value;
                        if (length === $undefined)
                            end = reader.len;
                        else {
                            end = reader.pos + length;
                            if (end > reader.len)
                                throw $RangeError("index out of range");
                            length = reader.len;
                            reader.len = end;
                        }
                        message = _target || new $root.blueswallow.vnext.sync.v1.DatasetCommit();
                        while (reader.pos < end) {
                            var start = reader.pos;
                            var tag = reader.tag();
                            if (tag === _end) {
                                _end = $undefined;
                                break;
                            }
                            var wireType = tag & 7;
                            switch (tag >>>= 3) {
                            case 1: {
                                    if (wireType !== 0)
                                        break;
                                    if (value = reader.uint32())
                                        message.schemaVersion = value;
                                    else
                                        delete message.schemaVersion;
                                    continue;
                                }
                            case 2: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.groupId = value;
                                    else
                                        delete message.groupId;
                                    continue;
                                }
                            case 3: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.publisherDeviceId = value;
                                    else
                                        delete message.publisherDeviceId;
                                    continue;
                                }
                            case 4: {
                                    if (wireType !== 0)
                                        break;
                                    if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                        message.sequence = value;
                                    else
                                        delete message.sequence;
                                    continue;
                                }
                            case 5: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.previousCommitSha256 = value;
                                    else
                                        delete message.previousCommitSha256;
                                    continue;
                                }
                            case 6: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.deltaSha256 = value;
                                    else
                                        delete message.deltaSha256;
                                    continue;
                                }
                            case 7: {
                                    if (wireType !== 0)
                                        break;
                                    if (value = reader.uint32())
                                        message.deltaSize = value;
                                    else
                                        delete message.deltaSize;
                                    continue;
                                }
                            case 8: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.batchId = value;
                                    else
                                        delete message.batchId;
                                    continue;
                                }
                            case 9: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.sessionId = value;
                                    else
                                        delete message.sessionId;
                                    continue;
                                }
                            case 10: {
                                    if (wireType !== 0)
                                        break;
                                    if (value = reader.bool())
                                        message.finalPart = value;
                                    else
                                        delete message.finalPart;
                                    continue;
                                }
                            case 11: {
                                    if (wireType !== 0)
                                        break;
                                    if (value = reader.uint32())
                                        message.observationCount = value;
                                    else
                                        delete message.observationCount;
                                    continue;
                                }
                            case 12: {
                                    if (wireType !== 0)
                                        break;
                                    if (value = reader.uint32())
                                        message.eventCount = value;
                                    else
                                        delete message.eventCount;
                                    continue;
                                }
                            case 13: {
                                    if (wireType !== 0)
                                        break;
                                    if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                        message.closedControlSequence = value;
                                    else
                                        delete message.closedControlSequence;
                                    continue;
                                }
                            case 14: {
                                    if (wireType !== 0)
                                        break;
                                    if (value = reader.uint32())
                                        message.retractionCount = value;
                                    else
                                        delete message.retractionCount;
                                    continue;
                                }
                            case 15: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.recordScope = value;
                                    else
                                        delete message.recordScope;
                                    continue;
                                }
                            }
                            reader.skipType(wireType, _depth, tag);
                            if (!reader.discardUnknown) {
                                $util.makeProp(message, "$unknowns", false);
                                (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                            }
                        }
                        if (length !== $undefined) {
                            if (reader.pos !== end)
                                throw $RangeError("index out of range");
                            reader.len = length;
                        }
                        if (_end !== $undefined)
                            throw $Error("missing end group");
                        return message;
                    };

                    return DatasetCommit;
                })();

                v1.DatasetHead = (function() {

                    var DatasetHead = function (properties) {
                        if (properties)
                            for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                    this[keys[i]] = properties[keys[i]];
                    };

                    DatasetHead.prototype.schemaVersion = 0;
                    DatasetHead.prototype.groupId = "";
                    DatasetHead.prototype.publisherDeviceId = "";
                    DatasetHead.prototype.sequence = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                    DatasetHead.prototype.commitSha256 = "";

                    DatasetHead.encode = function (message, writer, _depth) {
                        if (!writer)
                            writer = $Writer.create();
                        if (_depth === $undefined)
                            _depth = 0;
                        if (_depth > $util.recursionLimit)
                            throw $Error("max depth exceeded");
                        if (message.schemaVersion != null && $Object.hasOwnProperty.call(message, "schemaVersion") && message.schemaVersion !== 0)
                            writer.uint32(8).uint32(message.schemaVersion);
                        if (message.groupId != null && $Object.hasOwnProperty.call(message, "groupId") && message.groupId !== "")
                            writer.uint32(18).string(message.groupId);
                        if (message.publisherDeviceId != null && $Object.hasOwnProperty.call(message, "publisherDeviceId") && message.publisherDeviceId !== "")
                            writer.uint32(26).string(message.publisherDeviceId);
                        if (message.sequence != null && $Object.hasOwnProperty.call(message, "sequence") && (typeof message.sequence === "object" ? message.sequence.low || message.sequence.high : message.sequence !== 0))
                            writer.uint32(32).uint64(message.sequence);
                        if (message.commitSha256 != null && $Object.hasOwnProperty.call(message, "commitSha256") && message.commitSha256 !== "")
                            writer.uint32(42).string(message.commitSha256);
                        if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                            for (var i = 0; i < message.$unknowns.length; ++i)
                                writer.raw(message.$unknowns[i]);
                        return writer;
                    };

                    DatasetHead.decode = function (reader, length, _end, _depth, _target) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        if (_depth === $undefined)
                            _depth = 0;
                        if (_depth > $Reader.recursionLimit)
                            throw $Error("max depth exceeded");
                        var end, message, value;
                        if (length === $undefined)
                            end = reader.len;
                        else {
                            end = reader.pos + length;
                            if (end > reader.len)
                                throw $RangeError("index out of range");
                            length = reader.len;
                            reader.len = end;
                        }
                        message = _target || new $root.blueswallow.vnext.sync.v1.DatasetHead();
                        while (reader.pos < end) {
                            var start = reader.pos;
                            var tag = reader.tag();
                            if (tag === _end) {
                                _end = $undefined;
                                break;
                            }
                            var wireType = tag & 7;
                            switch (tag >>>= 3) {
                            case 1: {
                                    if (wireType !== 0)
                                        break;
                                    if (value = reader.uint32())
                                        message.schemaVersion = value;
                                    else
                                        delete message.schemaVersion;
                                    continue;
                                }
                            case 2: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.groupId = value;
                                    else
                                        delete message.groupId;
                                    continue;
                                }
                            case 3: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.publisherDeviceId = value;
                                    else
                                        delete message.publisherDeviceId;
                                    continue;
                                }
                            case 4: {
                                    if (wireType !== 0)
                                        break;
                                    if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                        message.sequence = value;
                                    else
                                        delete message.sequence;
                                    continue;
                                }
                            case 5: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.commitSha256 = value;
                                    else
                                        delete message.commitSha256;
                                    continue;
                                }
                            }
                            reader.skipType(wireType, _depth, tag);
                            if (!reader.discardUnknown) {
                                $util.makeProp(message, "$unknowns", false);
                                (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                            }
                        }
                        if (length !== $undefined) {
                            if (reader.pos !== end)
                                throw $RangeError("index out of range");
                            reader.len = length;
                        }
                        if (_end !== $undefined)
                            throw $Error("missing end group");
                        return message;
                    };

                    return DatasetHead;
                })();

                v1.DatasetEvidenceSlot = (function() {

                    var DatasetEvidenceSlot = function (properties) {
                        if (properties)
                            for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                    this[keys[i]] = properties[keys[i]];
                    };

                    DatasetEvidenceSlot.prototype.schemaVersion = 0;
                    DatasetEvidenceSlot.prototype.groupId = "";
                    DatasetEvidenceSlot.prototype.publisherDeviceId = "";
                    DatasetEvidenceSlot.prototype.sequence = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                    DatasetEvidenceSlot.prototype.previousSlotSha256 = "";
                    DatasetEvidenceSlot.prototype.evidenceSha256 = "";
                    DatasetEvidenceSlot.prototype.evidenceSize = 0;
                    DatasetEvidenceSlot.prototype.evidenceId = "";
                    DatasetEvidenceSlot.prototype.markerId = "";
                    DatasetEvidenceSlot.prototype.sessionId = "";

                    DatasetEvidenceSlot.encode = function (message, writer, _depth) {
                        if (!writer)
                            writer = $Writer.create();
                        if (_depth === $undefined)
                            _depth = 0;
                        if (_depth > $util.recursionLimit)
                            throw $Error("max depth exceeded");
                        if (message.schemaVersion != null && $Object.hasOwnProperty.call(message, "schemaVersion") && message.schemaVersion !== 0)
                            writer.uint32(8).uint32(message.schemaVersion);
                        if (message.groupId != null && $Object.hasOwnProperty.call(message, "groupId") && message.groupId !== "")
                            writer.uint32(18).string(message.groupId);
                        if (message.publisherDeviceId != null && $Object.hasOwnProperty.call(message, "publisherDeviceId") && message.publisherDeviceId !== "")
                            writer.uint32(26).string(message.publisherDeviceId);
                        if (message.sequence != null && $Object.hasOwnProperty.call(message, "sequence") && (typeof message.sequence === "object" ? message.sequence.low || message.sequence.high : message.sequence !== 0))
                            writer.uint32(32).uint64(message.sequence);
                        if (message.previousSlotSha256 != null && $Object.hasOwnProperty.call(message, "previousSlotSha256") && message.previousSlotSha256 !== "")
                            writer.uint32(42).string(message.previousSlotSha256);
                        if (message.evidenceSha256 != null && $Object.hasOwnProperty.call(message, "evidenceSha256") && message.evidenceSha256 !== "")
                            writer.uint32(50).string(message.evidenceSha256);
                        if (message.evidenceSize != null && $Object.hasOwnProperty.call(message, "evidenceSize") && message.evidenceSize !== 0)
                            writer.uint32(56).uint32(message.evidenceSize);
                        if (message.evidenceId != null && $Object.hasOwnProperty.call(message, "evidenceId") && message.evidenceId !== "")
                            writer.uint32(66).string(message.evidenceId);
                        if (message.markerId != null && $Object.hasOwnProperty.call(message, "markerId") && message.markerId !== "")
                            writer.uint32(74).string(message.markerId);
                        if (message.sessionId != null && $Object.hasOwnProperty.call(message, "sessionId") && message.sessionId !== "")
                            writer.uint32(82).string(message.sessionId);
                        if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                            for (var i = 0; i < message.$unknowns.length; ++i)
                                writer.raw(message.$unknowns[i]);
                        return writer;
                    };

                    DatasetEvidenceSlot.decode = function (reader, length, _end, _depth, _target) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        if (_depth === $undefined)
                            _depth = 0;
                        if (_depth > $Reader.recursionLimit)
                            throw $Error("max depth exceeded");
                        var end, message, value;
                        if (length === $undefined)
                            end = reader.len;
                        else {
                            end = reader.pos + length;
                            if (end > reader.len)
                                throw $RangeError("index out of range");
                            length = reader.len;
                            reader.len = end;
                        }
                        message = _target || new $root.blueswallow.vnext.sync.v1.DatasetEvidenceSlot();
                        while (reader.pos < end) {
                            var start = reader.pos;
                            var tag = reader.tag();
                            if (tag === _end) {
                                _end = $undefined;
                                break;
                            }
                            var wireType = tag & 7;
                            switch (tag >>>= 3) {
                            case 1: {
                                    if (wireType !== 0)
                                        break;
                                    if (value = reader.uint32())
                                        message.schemaVersion = value;
                                    else
                                        delete message.schemaVersion;
                                    continue;
                                }
                            case 2: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.groupId = value;
                                    else
                                        delete message.groupId;
                                    continue;
                                }
                            case 3: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.publisherDeviceId = value;
                                    else
                                        delete message.publisherDeviceId;
                                    continue;
                                }
                            case 4: {
                                    if (wireType !== 0)
                                        break;
                                    if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                        message.sequence = value;
                                    else
                                        delete message.sequence;
                                    continue;
                                }
                            case 5: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.previousSlotSha256 = value;
                                    else
                                        delete message.previousSlotSha256;
                                    continue;
                                }
                            case 6: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.evidenceSha256 = value;
                                    else
                                        delete message.evidenceSha256;
                                    continue;
                                }
                            case 7: {
                                    if (wireType !== 0)
                                        break;
                                    if (value = reader.uint32())
                                        message.evidenceSize = value;
                                    else
                                        delete message.evidenceSize;
                                    continue;
                                }
                            case 8: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.evidenceId = value;
                                    else
                                        delete message.evidenceId;
                                    continue;
                                }
                            case 9: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.markerId = value;
                                    else
                                        delete message.markerId;
                                    continue;
                                }
                            case 10: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.sessionId = value;
                                    else
                                        delete message.sessionId;
                                    continue;
                                }
                            }
                            reader.skipType(wireType, _depth, tag);
                            if (!reader.discardUnknown) {
                                $util.makeProp(message, "$unknowns", false);
                                (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                            }
                        }
                        if (length !== $undefined) {
                            if (reader.pos !== end)
                                throw $RangeError("index out of range");
                            reader.len = length;
                        }
                        if (_end !== $undefined)
                            throw $Error("missing end group");
                        return message;
                    };

                    return DatasetEvidenceSlot;
                })();

                v1.DatasetEvidenceSkip = (function() {

                    var DatasetEvidenceSkip = function (properties) {
                        if (properties)
                            for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                    this[keys[i]] = properties[keys[i]];
                    };

                    DatasetEvidenceSkip.prototype.schemaVersion = 0;
                    DatasetEvidenceSkip.prototype.groupId = "";
                    DatasetEvidenceSkip.prototype.publisherDeviceId = "";
                    DatasetEvidenceSkip.prototype.sequence = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                    DatasetEvidenceSkip.prototype.previousSlotSha256 = "";

                    DatasetEvidenceSkip.encode = function (message, writer, _depth) {
                        if (!writer)
                            writer = $Writer.create();
                        if (_depth === $undefined)
                            _depth = 0;
                        if (_depth > $util.recursionLimit)
                            throw $Error("max depth exceeded");
                        if (message.schemaVersion != null && $Object.hasOwnProperty.call(message, "schemaVersion") && message.schemaVersion !== 0)
                            writer.uint32(8).uint32(message.schemaVersion);
                        if (message.groupId != null && $Object.hasOwnProperty.call(message, "groupId") && message.groupId !== "")
                            writer.uint32(18).string(message.groupId);
                        if (message.publisherDeviceId != null && $Object.hasOwnProperty.call(message, "publisherDeviceId") && message.publisherDeviceId !== "")
                            writer.uint32(26).string(message.publisherDeviceId);
                        if (message.sequence != null && $Object.hasOwnProperty.call(message, "sequence") && (typeof message.sequence === "object" ? message.sequence.low || message.sequence.high : message.sequence !== 0))
                            writer.uint32(32).uint64(message.sequence);
                        if (message.previousSlotSha256 != null && $Object.hasOwnProperty.call(message, "previousSlotSha256") && message.previousSlotSha256 !== "")
                            writer.uint32(42).string(message.previousSlotSha256);
                        if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                            for (var i = 0; i < message.$unknowns.length; ++i)
                                writer.raw(message.$unknowns[i]);
                        return writer;
                    };

                    DatasetEvidenceSkip.decode = function (reader, length, _end, _depth, _target) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        if (_depth === $undefined)
                            _depth = 0;
                        if (_depth > $Reader.recursionLimit)
                            throw $Error("max depth exceeded");
                        var end, message, value;
                        if (length === $undefined)
                            end = reader.len;
                        else {
                            end = reader.pos + length;
                            if (end > reader.len)
                                throw $RangeError("index out of range");
                            length = reader.len;
                            reader.len = end;
                        }
                        message = _target || new $root.blueswallow.vnext.sync.v1.DatasetEvidenceSkip();
                        while (reader.pos < end) {
                            var start = reader.pos;
                            var tag = reader.tag();
                            if (tag === _end) {
                                _end = $undefined;
                                break;
                            }
                            var wireType = tag & 7;
                            switch (tag >>>= 3) {
                            case 1: {
                                    if (wireType !== 0)
                                        break;
                                    if (value = reader.uint32())
                                        message.schemaVersion = value;
                                    else
                                        delete message.schemaVersion;
                                    continue;
                                }
                            case 2: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.groupId = value;
                                    else
                                        delete message.groupId;
                                    continue;
                                }
                            case 3: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.publisherDeviceId = value;
                                    else
                                        delete message.publisherDeviceId;
                                    continue;
                                }
                            case 4: {
                                    if (wireType !== 0)
                                        break;
                                    if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                        message.sequence = value;
                                    else
                                        delete message.sequence;
                                    continue;
                                }
                            case 5: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.previousSlotSha256 = value;
                                    else
                                        delete message.previousSlotSha256;
                                    continue;
                                }
                            }
                            reader.skipType(wireType, _depth, tag);
                            if (!reader.discardUnknown) {
                                $util.makeProp(message, "$unknowns", false);
                                (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                            }
                        }
                        if (length !== $undefined) {
                            if (reader.pos !== end)
                                throw $RangeError("index out of range");
                            reader.len = length;
                        }
                        if (_end !== $undefined)
                            throw $Error("missing end group");
                        return message;
                    };

                    return DatasetEvidenceSkip;
                })();

                return v1;
            })();

            return sync;
        })();

        vnext.v1 = (function() {

            var v1 = {};

            v1.Timing = (function() {

                var Timing = function (properties) {
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                Timing.prototype.bootEpoch = "";
                Timing.prototype.captureElapsedNs = $util.Long ? $util.Long.fromBits(0,0,false) : 0;
                Timing.prototype.receivedElapsedNs = $util.Long ? $util.Long.fromBits(0,0,false) : 0;
                Timing.prototype.wallTimeMs = $util.Long ? $util.Long.fromBits(0,0,false) : 0;
                Timing.prototype.sourceClock = "";
                Timing.prototype.uncertaintyNs = null;
                Timing.prototype.sourceTimestampNs = null;

                var $oneOfFields;

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Timing.prototype, "_uncertaintyNs", {
                    get: $util.oneOfGetter($oneOfFields = ["uncertaintyNs"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Timing.prototype, "_sourceTimestampNs", {
                    get: $util.oneOfGetter($oneOfFields = ["sourceTimestampNs"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                Timing.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.bootEpoch != null && $Object.hasOwnProperty.call(message, "bootEpoch") && message.bootEpoch !== "")
                        writer.uint32(10).string(message.bootEpoch);
                    if (message.captureElapsedNs != null && $Object.hasOwnProperty.call(message, "captureElapsedNs") && (typeof message.captureElapsedNs === "object" ? message.captureElapsedNs.low || message.captureElapsedNs.high : message.captureElapsedNs !== 0))
                        writer.uint32(16).int64(message.captureElapsedNs);
                    if (message.receivedElapsedNs != null && $Object.hasOwnProperty.call(message, "receivedElapsedNs") && (typeof message.receivedElapsedNs === "object" ? message.receivedElapsedNs.low || message.receivedElapsedNs.high : message.receivedElapsedNs !== 0))
                        writer.uint32(24).int64(message.receivedElapsedNs);
                    if (message.wallTimeMs != null && $Object.hasOwnProperty.call(message, "wallTimeMs") && (typeof message.wallTimeMs === "object" ? message.wallTimeMs.low || message.wallTimeMs.high : message.wallTimeMs !== 0))
                        writer.uint32(32).int64(message.wallTimeMs);
                    if (message.sourceClock != null && $Object.hasOwnProperty.call(message, "sourceClock") && message.sourceClock !== "")
                        writer.uint32(42).string(message.sourceClock);
                    if (message.uncertaintyNs != null && $Object.hasOwnProperty.call(message, "uncertaintyNs"))
                        writer.uint32(48).int64(message.uncertaintyNs);
                    if (message.sourceTimestampNs != null && $Object.hasOwnProperty.call(message, "sourceTimestampNs"))
                        writer.uint32(56).int64(message.sourceTimestampNs);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                Timing.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.Timing();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.bootEpoch = value;
                                else
                                    delete message.bootEpoch;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.int64()) === "object" ? value.low || value.high : value !== 0)
                                    message.captureElapsedNs = value;
                                else
                                    delete message.captureElapsedNs;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.int64()) === "object" ? value.low || value.high : value !== 0)
                                    message.receivedElapsedNs = value;
                                else
                                    delete message.receivedElapsedNs;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.int64()) === "object" ? value.low || value.high : value !== 0)
                                    message.wallTimeMs = value;
                                else
                                    delete message.wallTimeMs;
                                continue;
                            }
                        case 5: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.sourceClock = value;
                                else
                                    delete message.sourceClock;
                                continue;
                            }
                        case 6: {
                                if (wireType !== 0)
                                    break;
                                message.uncertaintyNs = reader.int64();
                                message._uncertaintyNs = "uncertaintyNs";
                                continue;
                            }
                        case 7: {
                                if (wireType !== 0)
                                    break;
                                message.sourceTimestampNs = reader.int64();
                                message._sourceTimestampNs = "sourceTimestampNs";
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return Timing;
            })();

            v1.Wifi = (function() {

                var Wifi = function (properties) {
                    this.informationElements = [];
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                Wifi.prototype.bssid = "";
                Wifi.prototype.ssid = "";
                Wifi.prototype.rssiDbm = 0;
                Wifi.prototype.frequencyMhz = 0;
                Wifi.prototype.capabilities = "";
                Wifi.prototype.rawSsid = null;
                Wifi.prototype.hidden = false;
                Wifi.prototype.passpoint = false;
                Wifi.prototype.channelWidth = 0;
                Wifi.prototype.centerFrequency0Mhz = 0;
                Wifi.prototype.centerFrequency1Mhz = 0;
                Wifi.prototype.informationElementStatus = 0;
                Wifi.prototype.informationElements = $util.emptyArray;

                var $oneOfFields;

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Wifi.prototype, "_rawSsid", {
                    get: $util.oneOfGetter($oneOfFields = ["rawSsid"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                Wifi.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.bssid != null && $Object.hasOwnProperty.call(message, "bssid") && message.bssid !== "")
                        writer.uint32(10).string(message.bssid);
                    if (message.ssid != null && $Object.hasOwnProperty.call(message, "ssid") && message.ssid !== "")
                        writer.uint32(18).string(message.ssid);
                    if (message.rssiDbm != null && $Object.hasOwnProperty.call(message, "rssiDbm") && message.rssiDbm !== 0)
                        writer.uint32(24).int32(message.rssiDbm);
                    if (message.frequencyMhz != null && $Object.hasOwnProperty.call(message, "frequencyMhz") && message.frequencyMhz !== 0)
                        writer.uint32(32).int32(message.frequencyMhz);
                    if (message.capabilities != null && $Object.hasOwnProperty.call(message, "capabilities") && message.capabilities !== "")
                        writer.uint32(42).string(message.capabilities);
                    if (message.rawSsid != null && $Object.hasOwnProperty.call(message, "rawSsid"))
                        writer.uint32(50).bytes(message.rawSsid);
                    if (message.hidden != null && $Object.hasOwnProperty.call(message, "hidden") && message.hidden !== false)
                        writer.uint32(56).bool(message.hidden);
                    if (message.passpoint != null && $Object.hasOwnProperty.call(message, "passpoint") && message.passpoint !== false)
                        writer.uint32(64).bool(message.passpoint);
                    if (message.channelWidth != null && $Object.hasOwnProperty.call(message, "channelWidth") && message.channelWidth !== 0)
                        writer.uint32(72).int32(message.channelWidth);
                    if (message.centerFrequency0Mhz != null && $Object.hasOwnProperty.call(message, "centerFrequency0Mhz") && message.centerFrequency0Mhz !== 0)
                        writer.uint32(80).int32(message.centerFrequency0Mhz);
                    if (message.centerFrequency1Mhz != null && $Object.hasOwnProperty.call(message, "centerFrequency1Mhz") && message.centerFrequency1Mhz !== 0)
                        writer.uint32(88).int32(message.centerFrequency1Mhz);
                    if (message.informationElementStatus != null && $Object.hasOwnProperty.call(message, "informationElementStatus") && message.informationElementStatus !== 0)
                        writer.uint32(96).int32(message.informationElementStatus);
                    if (message.informationElements != null && message.informationElements.length)
                        for (var i = 0; i < message.informationElements.length; ++i)
                            $root.blueswallow.vnext.v1.Wifi.InformationElement.encode(message.informationElements[i], writer.uint32(106).fork(), _depth + 1).ldelim();
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                Wifi.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.Wifi();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.bssid = value;
                                else
                                    delete message.bssid;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.ssid = value;
                                else
                                    delete message.ssid;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.rssiDbm = value;
                                else
                                    delete message.rssiDbm;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.frequencyMhz = value;
                                else
                                    delete message.frequencyMhz;
                                continue;
                            }
                        case 5: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.capabilities = value;
                                else
                                    delete message.capabilities;
                                continue;
                            }
                        case 6: {
                                if (wireType !== 2)
                                    break;
                                message.rawSsid = reader.bytes();
                                message._rawSsid = "rawSsid";
                                continue;
                            }
                        case 7: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.bool())
                                    message.hidden = value;
                                else
                                    delete message.hidden;
                                continue;
                            }
                        case 8: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.bool())
                                    message.passpoint = value;
                                else
                                    delete message.passpoint;
                                continue;
                            }
                        case 9: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.channelWidth = value;
                                else
                                    delete message.channelWidth;
                                continue;
                            }
                        case 10: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.centerFrequency0Mhz = value;
                                else
                                    delete message.centerFrequency0Mhz;
                                continue;
                            }
                        case 11: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.centerFrequency1Mhz = value;
                                else
                                    delete message.centerFrequency1Mhz;
                                continue;
                            }
                        case 12: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.informationElementStatus = value;
                                else
                                    delete message.informationElementStatus;
                                continue;
                            }
                        case 13: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.informationElements && message.informationElements.length))
                                    message.informationElements = [];
                                message.informationElements.push($root.blueswallow.vnext.v1.Wifi.InformationElement.decode(reader, reader.size(), $undefined, _depth + 1));
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                Wifi.InformationElementStatus = (function() {
                    var valuesById = $Object.create(null), values = $Object.create(valuesById);
                    values[valuesById[0] = "IE_NOT_RECORDED"] = 0;
                    values[valuesById[1] = "IE_UNSUPPORTED"] = 1;
                    values[valuesById[2] = "IE_UNAVAILABLE"] = 2;
                    values[valuesById[3] = "IE_CAPTURED"] = 3;
                    values[valuesById[4] = "IE_TRUNCATED"] = 4;
                    return values;
                })();

                Wifi.InformationElement = (function() {

                    var InformationElement = function (properties) {
                        if (properties)
                            for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                    this[keys[i]] = properties[keys[i]];
                    };

                    InformationElement.prototype.id = 0;
                    InformationElement.prototype.idExt = 0;
                    InformationElement.prototype.payload = $util.newBuffer([]);

                    InformationElement.encode = function (message, writer, _depth) {
                        if (!writer)
                            writer = $Writer.create();
                        if (_depth === $undefined)
                            _depth = 0;
                        if (_depth > $util.recursionLimit)
                            throw $Error("max depth exceeded");
                        if (message.id != null && $Object.hasOwnProperty.call(message, "id") && message.id !== 0)
                            writer.uint32(8).int32(message.id);
                        if (message.idExt != null && $Object.hasOwnProperty.call(message, "idExt") && message.idExt !== 0)
                            writer.uint32(16).int32(message.idExt);
                        if (message.payload != null && $Object.hasOwnProperty.call(message, "payload") && message.payload.length)
                            writer.uint32(26).bytes(message.payload);
                        if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                            for (var i = 0; i < message.$unknowns.length; ++i)
                                writer.raw(message.$unknowns[i]);
                        return writer;
                    };

                    InformationElement.decode = function (reader, length, _end, _depth, _target) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        if (_depth === $undefined)
                            _depth = 0;
                        if (_depth > $Reader.recursionLimit)
                            throw $Error("max depth exceeded");
                        var end, message, value;
                        if (length === $undefined)
                            end = reader.len;
                        else {
                            end = reader.pos + length;
                            if (end > reader.len)
                                throw $RangeError("index out of range");
                            length = reader.len;
                            reader.len = end;
                        }
                        message = _target || new $root.blueswallow.vnext.v1.Wifi.InformationElement();
                        while (reader.pos < end) {
                            var start = reader.pos;
                            var tag = reader.tag();
                            if (tag === _end) {
                                _end = $undefined;
                                break;
                            }
                            var wireType = tag & 7;
                            switch (tag >>>= 3) {
                            case 1: {
                                    if (wireType !== 0)
                                        break;
                                    if (value = reader.int32())
                                        message.id = value;
                                    else
                                        delete message.id;
                                    continue;
                                }
                            case 2: {
                                    if (wireType !== 0)
                                        break;
                                    if (value = reader.int32())
                                        message.idExt = value;
                                    else
                                        delete message.idExt;
                                    continue;
                                }
                            case 3: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.bytes()).length)
                                        message.payload = value;
                                    else
                                        delete message.payload;
                                    continue;
                                }
                            }
                            reader.skipType(wireType, _depth, tag);
                            if (!reader.discardUnknown) {
                                $util.makeProp(message, "$unknowns", false);
                                (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                            }
                        }
                        if (length !== $undefined) {
                            if (reader.pos !== end)
                                throw $RangeError("index out of range");
                            reader.len = length;
                        }
                        if (_end !== $undefined)
                            throw $Error("missing end group");
                        return message;
                    };

                    return InformationElement;
                })();

                return Wifi;
            })();

            v1.Ble = (function() {

                var Ble = function (properties) {
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                Ble.prototype.address = "";
                Ble.prototype.advertisement = $util.newBuffer([]);
                Ble.prototype.rssiDbm = 0;
                Ble.prototype.txPowerDbm = null;
                Ble.prototype.connectable = false;
                Ble.prototype.primaryPhy = 0;
                Ble.prototype.secondaryPhy = 0;
                Ble.prototype.advertisingSid = null;
                Ble.prototype.dataStatus = 0;
                Ble.prototype.periodicInterval = 0;
                Ble.prototype.addressType = 0;
                Ble.prototype.platformAddressType = null;

                var $oneOfFields;

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Ble.prototype, "_txPowerDbm", {
                    get: $util.oneOfGetter($oneOfFields = ["txPowerDbm"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Ble.prototype, "_advertisingSid", {
                    get: $util.oneOfGetter($oneOfFields = ["advertisingSid"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Ble.prototype, "_platformAddressType", {
                    get: $util.oneOfGetter($oneOfFields = ["platformAddressType"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                Ble.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.address != null && $Object.hasOwnProperty.call(message, "address") && message.address !== "")
                        writer.uint32(10).string(message.address);
                    if (message.advertisement != null && $Object.hasOwnProperty.call(message, "advertisement") && message.advertisement.length)
                        writer.uint32(18).bytes(message.advertisement);
                    if (message.rssiDbm != null && $Object.hasOwnProperty.call(message, "rssiDbm") && message.rssiDbm !== 0)
                        writer.uint32(24).int32(message.rssiDbm);
                    if (message.txPowerDbm != null && $Object.hasOwnProperty.call(message, "txPowerDbm"))
                        writer.uint32(32).int32(message.txPowerDbm);
                    if (message.connectable != null && $Object.hasOwnProperty.call(message, "connectable") && message.connectable !== false)
                        writer.uint32(40).bool(message.connectable);
                    if (message.primaryPhy != null && $Object.hasOwnProperty.call(message, "primaryPhy") && message.primaryPhy !== 0)
                        writer.uint32(48).int32(message.primaryPhy);
                    if (message.secondaryPhy != null && $Object.hasOwnProperty.call(message, "secondaryPhy") && message.secondaryPhy !== 0)
                        writer.uint32(56).int32(message.secondaryPhy);
                    if (message.advertisingSid != null && $Object.hasOwnProperty.call(message, "advertisingSid"))
                        writer.uint32(64).int32(message.advertisingSid);
                    if (message.dataStatus != null && $Object.hasOwnProperty.call(message, "dataStatus") && message.dataStatus !== 0)
                        writer.uint32(72).int32(message.dataStatus);
                    if (message.periodicInterval != null && $Object.hasOwnProperty.call(message, "periodicInterval") && message.periodicInterval !== 0)
                        writer.uint32(80).int32(message.periodicInterval);
                    if (message.addressType != null && $Object.hasOwnProperty.call(message, "addressType") && message.addressType !== 0)
                        writer.uint32(88).int32(message.addressType);
                    if (message.platformAddressType != null && $Object.hasOwnProperty.call(message, "platformAddressType"))
                        writer.uint32(96).int32(message.platformAddressType);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                Ble.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.Ble();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.address = value;
                                else
                                    delete message.address;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.bytes()).length)
                                    message.advertisement = value;
                                else
                                    delete message.advertisement;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.rssiDbm = value;
                                else
                                    delete message.rssiDbm;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 0)
                                    break;
                                message.txPowerDbm = reader.int32();
                                message._txPowerDbm = "txPowerDbm";
                                continue;
                            }
                        case 5: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.bool())
                                    message.connectable = value;
                                else
                                    delete message.connectable;
                                continue;
                            }
                        case 6: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.primaryPhy = value;
                                else
                                    delete message.primaryPhy;
                                continue;
                            }
                        case 7: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.secondaryPhy = value;
                                else
                                    delete message.secondaryPhy;
                                continue;
                            }
                        case 8: {
                                if (wireType !== 0)
                                    break;
                                message.advertisingSid = reader.int32();
                                message._advertisingSid = "advertisingSid";
                                continue;
                            }
                        case 9: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.dataStatus = value;
                                else
                                    delete message.dataStatus;
                                continue;
                            }
                        case 10: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.periodicInterval = value;
                                else
                                    delete message.periodicInterval;
                                continue;
                            }
                        case 11: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.addressType = value;
                                else
                                    delete message.addressType;
                                continue;
                            }
                        case 12: {
                                if (wireType !== 0)
                                    break;
                                message.platformAddressType = reader.int32();
                                message._platformAddressType = "platformAddressType";
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                Ble.AddressType = (function() {
                    var valuesById = $Object.create(null), values = $Object.create(valuesById);
                    values[valuesById[0] = "ADDRESS_TYPE_NOT_RECORDED"] = 0;
                    values[valuesById[1] = "ADDRESS_TYPE_UNSUPPORTED"] = 1;
                    values[valuesById[2] = "ADDRESS_TYPE_UNKNOWN"] = 2;
                    values[valuesById[3] = "ADDRESS_TYPE_PUBLIC"] = 3;
                    values[valuesById[4] = "ADDRESS_TYPE_RANDOM"] = 4;
                    values[valuesById[5] = "ADDRESS_TYPE_ANONYMOUS"] = 5;
                    values[valuesById[6] = "ADDRESS_TYPE_OTHER"] = 6;
                    values[valuesById[7] = "ADDRESS_TYPE_UNAVAILABLE"] = 7;
                    return values;
                })();

                return Ble;
            })();

            v1.Cell = (function() {

                var Cell = function (properties) {
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                Cell.prototype.technology = 0;
                Cell.prototype.registered = false;
                Cell.prototype.mcc = null;
                Cell.prototype.mnc = null;
                Cell.prototype.cellIdentity = null;
                Cell.prototype.areaCode = null;
                Cell.prototype.physicalCellId = null;
                Cell.prototype.channelNumber = null;
                Cell.prototype.signalDbm = null;

                var $oneOfFields;

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Cell.prototype, "_mcc", {
                    get: $util.oneOfGetter($oneOfFields = ["mcc"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Cell.prototype, "_mnc", {
                    get: $util.oneOfGetter($oneOfFields = ["mnc"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Cell.prototype, "_cellIdentity", {
                    get: $util.oneOfGetter($oneOfFields = ["cellIdentity"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Cell.prototype, "_areaCode", {
                    get: $util.oneOfGetter($oneOfFields = ["areaCode"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Cell.prototype, "_physicalCellId", {
                    get: $util.oneOfGetter($oneOfFields = ["physicalCellId"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Cell.prototype, "_channelNumber", {
                    get: $util.oneOfGetter($oneOfFields = ["channelNumber"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Cell.prototype, "_signalDbm", {
                    get: $util.oneOfGetter($oneOfFields = ["signalDbm"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                Cell.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.technology != null && $Object.hasOwnProperty.call(message, "technology") && message.technology !== 0)
                        writer.uint32(8).int32(message.technology);
                    if (message.registered != null && $Object.hasOwnProperty.call(message, "registered") && message.registered !== false)
                        writer.uint32(16).bool(message.registered);
                    if (message.mcc != null && $Object.hasOwnProperty.call(message, "mcc"))
                        writer.uint32(26).string(message.mcc);
                    if (message.mnc != null && $Object.hasOwnProperty.call(message, "mnc"))
                        writer.uint32(34).string(message.mnc);
                    if (message.cellIdentity != null && $Object.hasOwnProperty.call(message, "cellIdentity"))
                        writer.uint32(40).int64(message.cellIdentity);
                    if (message.areaCode != null && $Object.hasOwnProperty.call(message, "areaCode"))
                        writer.uint32(48).int32(message.areaCode);
                    if (message.physicalCellId != null && $Object.hasOwnProperty.call(message, "physicalCellId"))
                        writer.uint32(56).int32(message.physicalCellId);
                    if (message.channelNumber != null && $Object.hasOwnProperty.call(message, "channelNumber"))
                        writer.uint32(64).int32(message.channelNumber);
                    if (message.signalDbm != null && $Object.hasOwnProperty.call(message, "signalDbm"))
                        writer.uint32(72).int32(message.signalDbm);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                Cell.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.Cell();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.technology = value;
                                else
                                    delete message.technology;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.bool())
                                    message.registered = value;
                                else
                                    delete message.registered;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                message.mcc = reader.stringVerify();
                                message._mcc = "mcc";
                                continue;
                            }
                        case 4: {
                                if (wireType !== 2)
                                    break;
                                message.mnc = reader.stringVerify();
                                message._mnc = "mnc";
                                continue;
                            }
                        case 5: {
                                if (wireType !== 0)
                                    break;
                                message.cellIdentity = reader.int64();
                                message._cellIdentity = "cellIdentity";
                                continue;
                            }
                        case 6: {
                                if (wireType !== 0)
                                    break;
                                message.areaCode = reader.int32();
                                message._areaCode = "areaCode";
                                continue;
                            }
                        case 7: {
                                if (wireType !== 0)
                                    break;
                                message.physicalCellId = reader.int32();
                                message._physicalCellId = "physicalCellId";
                                continue;
                            }
                        case 8: {
                                if (wireType !== 0)
                                    break;
                                message.channelNumber = reader.int32();
                                message._channelNumber = "channelNumber";
                                continue;
                            }
                        case 9: {
                                if (wireType !== 0)
                                    break;
                                message.signalDbm = reader.int32();
                                message._signalDbm = "signalDbm";
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                Cell.Technology = (function() {
                    var valuesById = $Object.create(null), values = $Object.create(valuesById);
                    values[valuesById[0] = "UNKNOWN"] = 0;
                    values[valuesById[1] = "GSM"] = 1;
                    values[valuesById[2] = "WCDMA"] = 2;
                    values[valuesById[3] = "LTE"] = 3;
                    values[valuesById[4] = "NR"] = 4;
                    values[valuesById[5] = "CDMA"] = 5;
                    return values;
                })();

                return Cell;
            })();

            v1.Gnss = (function() {

                var Gnss = function (properties) {
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                Gnss.prototype.latitudeDeg = 0;
                Gnss.prototype.longitudeDeg = 0;
                Gnss.prototype.altitudeM = null;
                Gnss.prototype.horizontalAccuracyM = null;
                Gnss.prototype.verticalAccuracyM = null;
                Gnss.prototype.speedMps = null;
                Gnss.prototype.bearingDeg = null;
                Gnss.prototype.provider = "";
                Gnss.prototype.speedAccuracyMps = null;

                var $oneOfFields;

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Gnss.prototype, "_altitudeM", {
                    get: $util.oneOfGetter($oneOfFields = ["altitudeM"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Gnss.prototype, "_horizontalAccuracyM", {
                    get: $util.oneOfGetter($oneOfFields = ["horizontalAccuracyM"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Gnss.prototype, "_verticalAccuracyM", {
                    get: $util.oneOfGetter($oneOfFields = ["verticalAccuracyM"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Gnss.prototype, "_speedMps", {
                    get: $util.oneOfGetter($oneOfFields = ["speedMps"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Gnss.prototype, "_bearingDeg", {
                    get: $util.oneOfGetter($oneOfFields = ["bearingDeg"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Gnss.prototype, "_speedAccuracyMps", {
                    get: $util.oneOfGetter($oneOfFields = ["speedAccuracyMps"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                Gnss.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.latitudeDeg != null && $Object.hasOwnProperty.call(message, "latitudeDeg") && !$Object.is(message.latitudeDeg, 0))
                        writer.uint32(9).double(message.latitudeDeg);
                    if (message.longitudeDeg != null && $Object.hasOwnProperty.call(message, "longitudeDeg") && !$Object.is(message.longitudeDeg, 0))
                        writer.uint32(17).double(message.longitudeDeg);
                    if (message.altitudeM != null && $Object.hasOwnProperty.call(message, "altitudeM"))
                        writer.uint32(25).double(message.altitudeM);
                    if (message.horizontalAccuracyM != null && $Object.hasOwnProperty.call(message, "horizontalAccuracyM"))
                        writer.uint32(37).float(message.horizontalAccuracyM);
                    if (message.verticalAccuracyM != null && $Object.hasOwnProperty.call(message, "verticalAccuracyM"))
                        writer.uint32(45).float(message.verticalAccuracyM);
                    if (message.speedMps != null && $Object.hasOwnProperty.call(message, "speedMps"))
                        writer.uint32(53).float(message.speedMps);
                    if (message.bearingDeg != null && $Object.hasOwnProperty.call(message, "bearingDeg"))
                        writer.uint32(61).float(message.bearingDeg);
                    if (message.provider != null && $Object.hasOwnProperty.call(message, "provider") && message.provider !== "")
                        writer.uint32(66).string(message.provider);
                    if (message.speedAccuracyMps != null && $Object.hasOwnProperty.call(message, "speedAccuracyMps"))
                        writer.uint32(77).float(message.speedAccuracyMps);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                Gnss.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.Gnss();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 1)
                                    break;
                                if (!$Object.is(value = reader.double(), 0))
                                    message.latitudeDeg = value;
                                else
                                    delete message.latitudeDeg;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 1)
                                    break;
                                if (!$Object.is(value = reader.double(), 0))
                                    message.longitudeDeg = value;
                                else
                                    delete message.longitudeDeg;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 1)
                                    break;
                                message.altitudeM = reader.double();
                                message._altitudeM = "altitudeM";
                                continue;
                            }
                        case 4: {
                                if (wireType !== 5)
                                    break;
                                message.horizontalAccuracyM = reader.float();
                                message._horizontalAccuracyM = "horizontalAccuracyM";
                                continue;
                            }
                        case 5: {
                                if (wireType !== 5)
                                    break;
                                message.verticalAccuracyM = reader.float();
                                message._verticalAccuracyM = "verticalAccuracyM";
                                continue;
                            }
                        case 6: {
                                if (wireType !== 5)
                                    break;
                                message.speedMps = reader.float();
                                message._speedMps = "speedMps";
                                continue;
                            }
                        case 7: {
                                if (wireType !== 5)
                                    break;
                                message.bearingDeg = reader.float();
                                message._bearingDeg = "bearingDeg";
                                continue;
                            }
                        case 8: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.provider = value;
                                else
                                    delete message.provider;
                                continue;
                            }
                        case 9: {
                                if (wireType !== 5)
                                    break;
                                message.speedAccuracyMps = reader.float();
                                message._speedAccuracyMps = "speedAccuracyMps";
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return Gnss;
            })();

            v1.Imu = (function() {

                var Imu = function (properties) {
                    this.values = [];
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                Imu.prototype.sensorType = "";
                Imu.prototype.values = $util.emptyArray;
                Imu.prototype.accuracy = 0;

                Imu.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.sensorType != null && $Object.hasOwnProperty.call(message, "sensorType") && message.sensorType !== "")
                        writer.uint32(10).string(message.sensorType);
                    if (message.values != null && message.values.length)
                        writer.uint32(18).floats(message.values);
                    if (message.accuracy != null && $Object.hasOwnProperty.call(message, "accuracy") && message.accuracy !== 0)
                        writer.uint32(24).int32(message.accuracy);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                Imu.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.Imu();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.sensorType = value;
                                else
                                    delete message.sensorType;
                                continue;
                            }
                        case 2: {
                                if (wireType === 2) {
                                    if (!(message.values && message.values.length))
                                        message.values = [];
                                    reader.floats(message.values);
                                    continue;
                                }
                                if (wireType !== 5)
                                    break;
                                if (!(message.values && message.values.length))
                                    message.values = [];
                                message.values.push(reader.float());
                                continue;
                            }
                        case 3: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.accuracy = value;
                                else
                                    delete message.accuracy;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return Imu;
            })();

            v1.Visual = (function() {

                var Visual = function (properties) {
                    this.imageBox = [];
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                Visual.prototype.modelId = "";
                Visual.prototype.modelSha256 = "";
                Visual.prototype.modelVersion = "";
                Visual.prototype.label = "";
                Visual.prototype.score = 0;
                Visual.prototype.imageBox = $util.emptyArray;
                Visual.prototype.imageWidth = 0;
                Visual.prototype.imageHeight = 0;
                Visual.prototype.descriptorSha256 = null;

                var $oneOfFields;

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Visual.prototype, "_descriptorSha256", {
                    get: $util.oneOfGetter($oneOfFields = ["descriptorSha256"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                Visual.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.modelId != null && $Object.hasOwnProperty.call(message, "modelId") && message.modelId !== "")
                        writer.uint32(10).string(message.modelId);
                    if (message.modelSha256 != null && $Object.hasOwnProperty.call(message, "modelSha256") && message.modelSha256 !== "")
                        writer.uint32(18).string(message.modelSha256);
                    if (message.modelVersion != null && $Object.hasOwnProperty.call(message, "modelVersion") && message.modelVersion !== "")
                        writer.uint32(26).string(message.modelVersion);
                    if (message.label != null && $Object.hasOwnProperty.call(message, "label") && message.label !== "")
                        writer.uint32(34).string(message.label);
                    if (message.score != null && $Object.hasOwnProperty.call(message, "score") && !$Object.is(message.score, 0))
                        writer.uint32(45).float(message.score);
                    if (message.imageBox != null && message.imageBox.length)
                        writer.uint32(50).floats(message.imageBox);
                    if (message.imageWidth != null && $Object.hasOwnProperty.call(message, "imageWidth") && message.imageWidth !== 0)
                        writer.uint32(56).int32(message.imageWidth);
                    if (message.imageHeight != null && $Object.hasOwnProperty.call(message, "imageHeight") && message.imageHeight !== 0)
                        writer.uint32(64).int32(message.imageHeight);
                    if (message.descriptorSha256 != null && $Object.hasOwnProperty.call(message, "descriptorSha256"))
                        writer.uint32(74).string(message.descriptorSha256);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                Visual.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.Visual();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.modelId = value;
                                else
                                    delete message.modelId;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.modelSha256 = value;
                                else
                                    delete message.modelSha256;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.modelVersion = value;
                                else
                                    delete message.modelVersion;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.label = value;
                                else
                                    delete message.label;
                                continue;
                            }
                        case 5: {
                                if (wireType !== 5)
                                    break;
                                if (!$Object.is(value = reader.float(), 0))
                                    message.score = value;
                                else
                                    delete message.score;
                                continue;
                            }
                        case 6: {
                                if (wireType === 2) {
                                    if (!(message.imageBox && message.imageBox.length))
                                        message.imageBox = [];
                                    reader.floats(message.imageBox);
                                    continue;
                                }
                                if (wireType !== 5)
                                    break;
                                if (!(message.imageBox && message.imageBox.length))
                                    message.imageBox = [];
                                message.imageBox.push(reader.float());
                                continue;
                            }
                        case 7: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.imageWidth = value;
                                else
                                    delete message.imageWidth;
                                continue;
                            }
                        case 8: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.imageHeight = value;
                                else
                                    delete message.imageHeight;
                                continue;
                            }
                        case 9: {
                                if (wireType !== 2)
                                    break;
                                message.descriptorSha256 = reader.stringVerify();
                                message._descriptorSha256 = "descriptorSha256";
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return Visual;
            })();

            v1.External = (function() {

                var External = function (properties) {
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                External.prototype.mediaType = "";
                External.prototype.payload = $util.newBuffer([]);
                External.prototype.schemaId = "";

                External.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.mediaType != null && $Object.hasOwnProperty.call(message, "mediaType") && message.mediaType !== "")
                        writer.uint32(10).string(message.mediaType);
                    if (message.payload != null && $Object.hasOwnProperty.call(message, "payload") && message.payload.length)
                        writer.uint32(18).bytes(message.payload);
                    if (message.schemaId != null && $Object.hasOwnProperty.call(message, "schemaId") && message.schemaId !== "")
                        writer.uint32(26).string(message.schemaId);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                External.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.External();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.mediaType = value;
                                else
                                    delete message.mediaType;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.bytes()).length)
                                    message.payload = value;
                                else
                                    delete message.payload;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.schemaId = value;
                                else
                                    delete message.schemaId;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return External;
            })();

            v1.ArPose = (function() {

                var ArPose = function (properties) {
                    this.translationM = [];
                    this.quaternionXyzw = [];
                    this.focalLengthPx = [];
                    this.principalPointPx = [];
                    this.imageDimensions = [];
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                ArPose.prototype.translationM = $util.emptyArray;
                ArPose.prototype.quaternionXyzw = $util.emptyArray;
                ArPose.prototype.trackingState = "";
                ArPose.prototype.focalLengthPx = $util.emptyArray;
                ArPose.prototype.principalPointPx = $util.emptyArray;
                ArPose.prototype.imageDimensions = $util.emptyArray;
                ArPose.prototype.rawDepthSupported = false;
                ArPose.prototype.worldFrame = "";

                ArPose.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.translationM != null && message.translationM.length)
                        writer.uint32(10).floats(message.translationM);
                    if (message.quaternionXyzw != null && message.quaternionXyzw.length)
                        writer.uint32(18).floats(message.quaternionXyzw);
                    if (message.trackingState != null && $Object.hasOwnProperty.call(message, "trackingState") && message.trackingState !== "")
                        writer.uint32(26).string(message.trackingState);
                    if (message.focalLengthPx != null && message.focalLengthPx.length)
                        writer.uint32(34).floats(message.focalLengthPx);
                    if (message.principalPointPx != null && message.principalPointPx.length)
                        writer.uint32(42).floats(message.principalPointPx);
                    if (message.imageDimensions != null && message.imageDimensions.length)
                        writer.uint32(50).int32s(message.imageDimensions);
                    if (message.rawDepthSupported != null && $Object.hasOwnProperty.call(message, "rawDepthSupported") && message.rawDepthSupported !== false)
                        writer.uint32(56).bool(message.rawDepthSupported);
                    if (message.worldFrame != null && $Object.hasOwnProperty.call(message, "worldFrame") && message.worldFrame !== "")
                        writer.uint32(66).string(message.worldFrame);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                ArPose.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.ArPose();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType === 2) {
                                    if (!(message.translationM && message.translationM.length))
                                        message.translationM = [];
                                    reader.floats(message.translationM);
                                    continue;
                                }
                                if (wireType !== 5)
                                    break;
                                if (!(message.translationM && message.translationM.length))
                                    message.translationM = [];
                                message.translationM.push(reader.float());
                                continue;
                            }
                        case 2: {
                                if (wireType === 2) {
                                    if (!(message.quaternionXyzw && message.quaternionXyzw.length))
                                        message.quaternionXyzw = [];
                                    reader.floats(message.quaternionXyzw);
                                    continue;
                                }
                                if (wireType !== 5)
                                    break;
                                if (!(message.quaternionXyzw && message.quaternionXyzw.length))
                                    message.quaternionXyzw = [];
                                message.quaternionXyzw.push(reader.float());
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.trackingState = value;
                                else
                                    delete message.trackingState;
                                continue;
                            }
                        case 4: {
                                if (wireType === 2) {
                                    if (!(message.focalLengthPx && message.focalLengthPx.length))
                                        message.focalLengthPx = [];
                                    reader.floats(message.focalLengthPx);
                                    continue;
                                }
                                if (wireType !== 5)
                                    break;
                                if (!(message.focalLengthPx && message.focalLengthPx.length))
                                    message.focalLengthPx = [];
                                message.focalLengthPx.push(reader.float());
                                continue;
                            }
                        case 5: {
                                if (wireType === 2) {
                                    if (!(message.principalPointPx && message.principalPointPx.length))
                                        message.principalPointPx = [];
                                    reader.floats(message.principalPointPx);
                                    continue;
                                }
                                if (wireType !== 5)
                                    break;
                                if (!(message.principalPointPx && message.principalPointPx.length))
                                    message.principalPointPx = [];
                                message.principalPointPx.push(reader.float());
                                continue;
                            }
                        case 6: {
                                if (wireType === 2) {
                                    if (!(message.imageDimensions && message.imageDimensions.length))
                                        message.imageDimensions = [];
                                    reader.int32s(message.imageDimensions);
                                    continue;
                                }
                                if (wireType !== 0)
                                    break;
                                if (!(message.imageDimensions && message.imageDimensions.length))
                                    message.imageDimensions = [];
                                message.imageDimensions.push(reader.int32());
                                continue;
                            }
                        case 7: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.bool())
                                    message.rawDepthSupported = value;
                                else
                                    delete message.rawDepthSupported;
                                continue;
                            }
                        case 8: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.worldFrame = value;
                                else
                                    delete message.worldFrame;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return ArPose;
            })();

            v1.ObservationRecord = (function() {

                var ObservationRecord = function (properties) {
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                ObservationRecord.prototype.schemaVersion = 0;
                ObservationRecord.prototype.id = "";
                ObservationRecord.prototype.sessionId = "";
                ObservationRecord.prototype.sourceId = "";
                ObservationRecord.prototype.timing = null;
                ObservationRecord.prototype.frameId = "";
                ObservationRecord.prototype.wifi = null;
                ObservationRecord.prototype.ble = null;
                ObservationRecord.prototype.cell = null;
                ObservationRecord.prototype.gnss = null;
                ObservationRecord.prototype.imu = null;
                ObservationRecord.prototype.visual = null;
                ObservationRecord.prototype.external = null;
                ObservationRecord.prototype.arPose = null;

                var $oneOfFields;

                $Object.defineProperty(ObservationRecord.prototype, "payload", {
                    get: $util.oneOfGetter($oneOfFields = ["wifi", "ble", "cell", "gnss", "imu", "visual", "external", "arPose"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                ObservationRecord.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.schemaVersion != null && $Object.hasOwnProperty.call(message, "schemaVersion") && message.schemaVersion !== 0)
                        writer.uint32(8).uint32(message.schemaVersion);
                    if (message.id != null && $Object.hasOwnProperty.call(message, "id") && message.id !== "")
                        writer.uint32(18).string(message.id);
                    if (message.sessionId != null && $Object.hasOwnProperty.call(message, "sessionId") && message.sessionId !== "")
                        writer.uint32(26).string(message.sessionId);
                    if (message.sourceId != null && $Object.hasOwnProperty.call(message, "sourceId") && message.sourceId !== "")
                        writer.uint32(34).string(message.sourceId);
                    if (message.timing != null && $Object.hasOwnProperty.call(message, "timing"))
                        $root.blueswallow.vnext.v1.Timing.encode(message.timing, writer.uint32(42).fork(), _depth + 1).ldelim();
                    if (message.frameId != null && $Object.hasOwnProperty.call(message, "frameId") && message.frameId !== "")
                        writer.uint32(50).string(message.frameId);
                    if (message.wifi != null && $Object.hasOwnProperty.call(message, "wifi"))
                        $root.blueswallow.vnext.v1.Wifi.encode(message.wifi, writer.uint32(82).fork(), _depth + 1).ldelim();
                    if (message.ble != null && $Object.hasOwnProperty.call(message, "ble"))
                        $root.blueswallow.vnext.v1.Ble.encode(message.ble, writer.uint32(90).fork(), _depth + 1).ldelim();
                    if (message.cell != null && $Object.hasOwnProperty.call(message, "cell"))
                        $root.blueswallow.vnext.v1.Cell.encode(message.cell, writer.uint32(98).fork(), _depth + 1).ldelim();
                    if (message.gnss != null && $Object.hasOwnProperty.call(message, "gnss"))
                        $root.blueswallow.vnext.v1.Gnss.encode(message.gnss, writer.uint32(106).fork(), _depth + 1).ldelim();
                    if (message.imu != null && $Object.hasOwnProperty.call(message, "imu"))
                        $root.blueswallow.vnext.v1.Imu.encode(message.imu, writer.uint32(114).fork(), _depth + 1).ldelim();
                    if (message.visual != null && $Object.hasOwnProperty.call(message, "visual"))
                        $root.blueswallow.vnext.v1.Visual.encode(message.visual, writer.uint32(122).fork(), _depth + 1).ldelim();
                    if (message.external != null && $Object.hasOwnProperty.call(message, "external"))
                        $root.blueswallow.vnext.v1.External.encode(message.external, writer.uint32(130).fork(), _depth + 1).ldelim();
                    if (message.arPose != null && $Object.hasOwnProperty.call(message, "arPose"))
                        $root.blueswallow.vnext.v1.ArPose.encode(message.arPose, writer.uint32(138).fork(), _depth + 1).ldelim();
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                ObservationRecord.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.ObservationRecord();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.uint32())
                                    message.schemaVersion = value;
                                else
                                    delete message.schemaVersion;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.id = value;
                                else
                                    delete message.id;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.sessionId = value;
                                else
                                    delete message.sessionId;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.sourceId = value;
                                else
                                    delete message.sourceId;
                                continue;
                            }
                        case 5: {
                                if (wireType !== 2)
                                    break;
                                message.timing = $root.blueswallow.vnext.v1.Timing.decode(reader, reader.size(), $undefined, _depth + 1, message.timing);
                                continue;
                            }
                        case 6: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.frameId = value;
                                else
                                    delete message.frameId;
                                continue;
                            }
                        case 10: {
                                if (wireType !== 2)
                                    break;
                                message.wifi = $root.blueswallow.vnext.v1.Wifi.decode(reader, reader.size(), $undefined, _depth + 1, message.wifi);
                                message.payload = "wifi";
                                continue;
                            }
                        case 11: {
                                if (wireType !== 2)
                                    break;
                                message.ble = $root.blueswallow.vnext.v1.Ble.decode(reader, reader.size(), $undefined, _depth + 1, message.ble);
                                message.payload = "ble";
                                continue;
                            }
                        case 12: {
                                if (wireType !== 2)
                                    break;
                                message.cell = $root.blueswallow.vnext.v1.Cell.decode(reader, reader.size(), $undefined, _depth + 1, message.cell);
                                message.payload = "cell";
                                continue;
                            }
                        case 13: {
                                if (wireType !== 2)
                                    break;
                                message.gnss = $root.blueswallow.vnext.v1.Gnss.decode(reader, reader.size(), $undefined, _depth + 1, message.gnss);
                                message.payload = "gnss";
                                continue;
                            }
                        case 14: {
                                if (wireType !== 2)
                                    break;
                                message.imu = $root.blueswallow.vnext.v1.Imu.decode(reader, reader.size(), $undefined, _depth + 1, message.imu);
                                message.payload = "imu";
                                continue;
                            }
                        case 15: {
                                if (wireType !== 2)
                                    break;
                                message.visual = $root.blueswallow.vnext.v1.Visual.decode(reader, reader.size(), $undefined, _depth + 1, message.visual);
                                message.payload = "visual";
                                continue;
                            }
                        case 16: {
                                if (wireType !== 2)
                                    break;
                                message.external = $root.blueswallow.vnext.v1.External.decode(reader, reader.size(), $undefined, _depth + 1, message.external);
                                message.payload = "external";
                                continue;
                            }
                        case 17: {
                                if (wireType !== 2)
                                    break;
                                message.arPose = $root.blueswallow.vnext.v1.ArPose.decode(reader, reader.size(), $undefined, _depth + 1, message.arPose);
                                message.payload = "arPose";
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return ObservationRecord;
            })();

            v1.Derivation = (function() {

                var Derivation = function (properties) {
                    this.inputIds = [];
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                Derivation.prototype.algorithmId = "";
                Derivation.prototype.algorithmVersion = "";
                Derivation.prototype.inputIds = $util.emptyArray;
                Derivation.prototype.modelSha256 = "";
                Derivation.prototype.configurationSha256 = "";
                Derivation.prototype.specVersion = "";
                Derivation.prototype.evidenceLevel = "";

                Derivation.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.algorithmId != null && $Object.hasOwnProperty.call(message, "algorithmId") && message.algorithmId !== "")
                        writer.uint32(10).string(message.algorithmId);
                    if (message.algorithmVersion != null && $Object.hasOwnProperty.call(message, "algorithmVersion") && message.algorithmVersion !== "")
                        writer.uint32(18).string(message.algorithmVersion);
                    if (message.inputIds != null && message.inputIds.length)
                        for (var i = 0; i < message.inputIds.length; ++i)
                            writer.uint32(26).string(message.inputIds[i]);
                    if (message.modelSha256 != null && $Object.hasOwnProperty.call(message, "modelSha256") && message.modelSha256 !== "")
                        writer.uint32(34).string(message.modelSha256);
                    if (message.configurationSha256 != null && $Object.hasOwnProperty.call(message, "configurationSha256") && message.configurationSha256 !== "")
                        writer.uint32(42).string(message.configurationSha256);
                    if (message.specVersion != null && $Object.hasOwnProperty.call(message, "specVersion") && message.specVersion !== "")
                        writer.uint32(50).string(message.specVersion);
                    if (message.evidenceLevel != null && $Object.hasOwnProperty.call(message, "evidenceLevel") && message.evidenceLevel !== "")
                        writer.uint32(58).string(message.evidenceLevel);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                Derivation.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.Derivation();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.algorithmId = value;
                                else
                                    delete message.algorithmId;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.algorithmVersion = value;
                                else
                                    delete message.algorithmVersion;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.inputIds && message.inputIds.length))
                                    message.inputIds = [];
                                message.inputIds.push(reader.stringVerify());
                                continue;
                            }
                        case 4: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.modelSha256 = value;
                                else
                                    delete message.modelSha256;
                                continue;
                            }
                        case 5: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.configurationSha256 = value;
                                else
                                    delete message.configurationSha256;
                                continue;
                            }
                        case 6: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.specVersion = value;
                                else
                                    delete message.specVersion;
                                continue;
                            }
                        case 7: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.evidenceLevel = value;
                                else
                                    delete message.evidenceLevel;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return Derivation;
            })();

            v1.EvidenceRecord = (function() {

                var EvidenceRecord = function (properties) {
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                EvidenceRecord.prototype.schemaVersion = 0;
                EvidenceRecord.prototype.id = "";
                EvidenceRecord.prototype.derivation = null;
                EvidenceRecord.prototype.kind = "";
                EvidenceRecord.prototype.payload = $util.newBuffer([]);

                EvidenceRecord.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.schemaVersion != null && $Object.hasOwnProperty.call(message, "schemaVersion") && message.schemaVersion !== 0)
                        writer.uint32(8).uint32(message.schemaVersion);
                    if (message.id != null && $Object.hasOwnProperty.call(message, "id") && message.id !== "")
                        writer.uint32(18).string(message.id);
                    if (message.derivation != null && $Object.hasOwnProperty.call(message, "derivation"))
                        $root.blueswallow.vnext.v1.Derivation.encode(message.derivation, writer.uint32(26).fork(), _depth + 1).ldelim();
                    if (message.kind != null && $Object.hasOwnProperty.call(message, "kind") && message.kind !== "")
                        writer.uint32(34).string(message.kind);
                    if (message.payload != null && $Object.hasOwnProperty.call(message, "payload") && message.payload.length)
                        writer.uint32(42).bytes(message.payload);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                EvidenceRecord.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.EvidenceRecord();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.uint32())
                                    message.schemaVersion = value;
                                else
                                    delete message.schemaVersion;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.id = value;
                                else
                                    delete message.id;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                message.derivation = $root.blueswallow.vnext.v1.Derivation.decode(reader, reader.size(), $undefined, _depth + 1, message.derivation);
                                continue;
                            }
                        case 4: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.kind = value;
                                else
                                    delete message.kind;
                                continue;
                            }
                        case 5: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.bytes()).length)
                                    message.payload = value;
                                else
                                    delete message.payload;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return EvidenceRecord;
            })();

            v1.ClaimAttribute = (function() {

                var ClaimAttribute = function (properties) {
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                ClaimAttribute.prototype.key = "";
                ClaimAttribute.prototype.value = "";

                ClaimAttribute.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.key != null && $Object.hasOwnProperty.call(message, "key") && message.key !== "")
                        writer.uint32(10).string(message.key);
                    if (message.value != null && $Object.hasOwnProperty.call(message, "value") && message.value !== "")
                        writer.uint32(18).string(message.value);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                ClaimAttribute.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.ClaimAttribute();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.key = value;
                                else
                                    delete message.key;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.value = value;
                                else
                                    delete message.value;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return ClaimAttribute;
            })();

            v1.SemanticClaim = (function() {

                var SemanticClaim = function (properties) {
                    this.attributes = [];
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                SemanticClaim.prototype.name = "";
                SemanticClaim.prototype.evidenceLevel = "";
                SemanticClaim.prototype.attributes = $util.emptyArray;

                SemanticClaim.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.name != null && $Object.hasOwnProperty.call(message, "name") && message.name !== "")
                        writer.uint32(10).string(message.name);
                    if (message.evidenceLevel != null && $Object.hasOwnProperty.call(message, "evidenceLevel") && message.evidenceLevel !== "")
                        writer.uint32(18).string(message.evidenceLevel);
                    if (message.attributes != null && message.attributes.length)
                        for (var i = 0; i < message.attributes.length; ++i)
                            $root.blueswallow.vnext.v1.ClaimAttribute.encode(message.attributes[i], writer.uint32(26).fork(), _depth + 1).ldelim();
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                SemanticClaim.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.SemanticClaim();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.name = value;
                                else
                                    delete message.name;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.evidenceLevel = value;
                                else
                                    delete message.evidenceLevel;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.attributes && message.attributes.length))
                                    message.attributes = [];
                                message.attributes.push($root.blueswallow.vnext.v1.ClaimAttribute.decode(reader, reader.size(), $undefined, _depth + 1));
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return SemanticClaim;
            })();

            v1.EntityHypothesis = (function() {

                var EntityHypothesis = function (properties) {
                    this.evidenceIds = [];
                    this.previousRevisionIds = [];
                    this.contradictionIds = [];
                    this.relatedEntityIds = [];
                    this.reasons = [];
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                EntityHypothesis.prototype.entityId = "";
                EntityHypothesis.prototype.revision = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                EntityHypothesis.prototype.derivation = null;
                EntityHypothesis.prototype.evidenceIds = $util.emptyArray;
                EntityHypothesis.prototype.status = "";
                EntityHypothesis.prototype.previousRevisionIds = $util.emptyArray;
                EntityHypothesis.prototype.contradictionIds = $util.emptyArray;
                EntityHypothesis.prototype.relatedEntityIds = $util.emptyArray;
                EntityHypothesis.prototype.reasons = $util.emptyArray;
                EntityHypothesis.prototype.sessionId = "";
                EntityHypothesis.prototype.bootEpoch = "";
                EntityHypothesis.prototype.validFromNs = $util.Long ? $util.Long.fromBits(0,0,false) : 0;
                EntityHypothesis.prototype.validUntilNs = $util.Long ? $util.Long.fromBits(0,0,false) : 0;
                EntityHypothesis.prototype.typeLabel = "";

                EntityHypothesis.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.entityId != null && $Object.hasOwnProperty.call(message, "entityId") && message.entityId !== "")
                        writer.uint32(10).string(message.entityId);
                    if (message.revision != null && $Object.hasOwnProperty.call(message, "revision") && (typeof message.revision === "object" ? message.revision.low || message.revision.high : message.revision !== 0))
                        writer.uint32(16).uint64(message.revision);
                    if (message.derivation != null && $Object.hasOwnProperty.call(message, "derivation"))
                        $root.blueswallow.vnext.v1.Derivation.encode(message.derivation, writer.uint32(26).fork(), _depth + 1).ldelim();
                    if (message.evidenceIds != null && message.evidenceIds.length)
                        for (var i = 0; i < message.evidenceIds.length; ++i)
                            writer.uint32(34).string(message.evidenceIds[i]);
                    if (message.status != null && $Object.hasOwnProperty.call(message, "status") && message.status !== "")
                        writer.uint32(42).string(message.status);
                    if (message.previousRevisionIds != null && message.previousRevisionIds.length)
                        for (var i = 0; i < message.previousRevisionIds.length; ++i)
                            writer.uint32(50).string(message.previousRevisionIds[i]);
                    if (message.contradictionIds != null && message.contradictionIds.length)
                        for (var i = 0; i < message.contradictionIds.length; ++i)
                            writer.uint32(58).string(message.contradictionIds[i]);
                    if (message.relatedEntityIds != null && message.relatedEntityIds.length)
                        for (var i = 0; i < message.relatedEntityIds.length; ++i)
                            writer.uint32(66).string(message.relatedEntityIds[i]);
                    if (message.reasons != null && message.reasons.length)
                        for (var i = 0; i < message.reasons.length; ++i)
                            writer.uint32(74).string(message.reasons[i]);
                    if (message.sessionId != null && $Object.hasOwnProperty.call(message, "sessionId") && message.sessionId !== "")
                        writer.uint32(82).string(message.sessionId);
                    if (message.bootEpoch != null && $Object.hasOwnProperty.call(message, "bootEpoch") && message.bootEpoch !== "")
                        writer.uint32(90).string(message.bootEpoch);
                    if (message.validFromNs != null && $Object.hasOwnProperty.call(message, "validFromNs") && (typeof message.validFromNs === "object" ? message.validFromNs.low || message.validFromNs.high : message.validFromNs !== 0))
                        writer.uint32(96).int64(message.validFromNs);
                    if (message.validUntilNs != null && $Object.hasOwnProperty.call(message, "validUntilNs") && (typeof message.validUntilNs === "object" ? message.validUntilNs.low || message.validUntilNs.high : message.validUntilNs !== 0))
                        writer.uint32(104).int64(message.validUntilNs);
                    if (message.typeLabel != null && $Object.hasOwnProperty.call(message, "typeLabel") && message.typeLabel !== "")
                        writer.uint32(114).string(message.typeLabel);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                EntityHypothesis.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.EntityHypothesis();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.entityId = value;
                                else
                                    delete message.entityId;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.revision = value;
                                else
                                    delete message.revision;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                message.derivation = $root.blueswallow.vnext.v1.Derivation.decode(reader, reader.size(), $undefined, _depth + 1, message.derivation);
                                continue;
                            }
                        case 4: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.evidenceIds && message.evidenceIds.length))
                                    message.evidenceIds = [];
                                message.evidenceIds.push(reader.stringVerify());
                                continue;
                            }
                        case 5: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.status = value;
                                else
                                    delete message.status;
                                continue;
                            }
                        case 6: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.previousRevisionIds && message.previousRevisionIds.length))
                                    message.previousRevisionIds = [];
                                message.previousRevisionIds.push(reader.stringVerify());
                                continue;
                            }
                        case 7: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.contradictionIds && message.contradictionIds.length))
                                    message.contradictionIds = [];
                                message.contradictionIds.push(reader.stringVerify());
                                continue;
                            }
                        case 8: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.relatedEntityIds && message.relatedEntityIds.length))
                                    message.relatedEntityIds = [];
                                message.relatedEntityIds.push(reader.stringVerify());
                                continue;
                            }
                        case 9: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.reasons && message.reasons.length))
                                    message.reasons = [];
                                message.reasons.push(reader.stringVerify());
                                continue;
                            }
                        case 10: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.sessionId = value;
                                else
                                    delete message.sessionId;
                                continue;
                            }
                        case 11: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.bootEpoch = value;
                                else
                                    delete message.bootEpoch;
                                continue;
                            }
                        case 12: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.int64()) === "object" ? value.low || value.high : value !== 0)
                                    message.validFromNs = value;
                                else
                                    delete message.validFromNs;
                                continue;
                            }
                        case 13: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.int64()) === "object" ? value.low || value.high : value !== 0)
                                    message.validUntilNs = value;
                                else
                                    delete message.validUntilNs;
                                continue;
                            }
                        case 14: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.typeLabel = value;
                                else
                                    delete message.typeLabel;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return EntityHypothesis;
            })();

            v1.RelationshipHypothesis = (function() {

                var RelationshipHypothesis = function (properties) {
                    this.entityIds = [];
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                RelationshipHypothesis.prototype.id = "";
                RelationshipHypothesis.prototype.revision = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                RelationshipHypothesis.prototype.derivation = null;
                RelationshipHypothesis.prototype.entityIds = $util.emptyArray;
                RelationshipHypothesis.prototype.relationship = "";

                RelationshipHypothesis.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.id != null && $Object.hasOwnProperty.call(message, "id") && message.id !== "")
                        writer.uint32(10).string(message.id);
                    if (message.revision != null && $Object.hasOwnProperty.call(message, "revision") && (typeof message.revision === "object" ? message.revision.low || message.revision.high : message.revision !== 0))
                        writer.uint32(16).uint64(message.revision);
                    if (message.derivation != null && $Object.hasOwnProperty.call(message, "derivation"))
                        $root.blueswallow.vnext.v1.Derivation.encode(message.derivation, writer.uint32(26).fork(), _depth + 1).ldelim();
                    if (message.entityIds != null && message.entityIds.length)
                        for (var i = 0; i < message.entityIds.length; ++i)
                            writer.uint32(34).string(message.entityIds[i]);
                    if (message.relationship != null && $Object.hasOwnProperty.call(message, "relationship") && message.relationship !== "")
                        writer.uint32(42).string(message.relationship);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                RelationshipHypothesis.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.RelationshipHypothesis();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.id = value;
                                else
                                    delete message.id;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.revision = value;
                                else
                                    delete message.revision;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                message.derivation = $root.blueswallow.vnext.v1.Derivation.decode(reader, reader.size(), $undefined, _depth + 1, message.derivation);
                                continue;
                            }
                        case 4: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.entityIds && message.entityIds.length))
                                    message.entityIds = [];
                                message.entityIds.push(reader.stringVerify());
                                continue;
                            }
                        case 5: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.relationship = value;
                                else
                                    delete message.relationship;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return RelationshipHypothesis;
            })();

            v1.SpatialBelief = (function() {

                var SpatialBelief = function (properties) {
                    this.positionM = [];
                    this.covarianceM2 = [];
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                SpatialBelief.prototype.entityId = "";
                SpatialBelief.prototype.derivation = null;
                SpatialBelief.prototype.frameId = "";
                SpatialBelief.prototype.positionM = $util.emptyArray;
                SpatialBelief.prototype.covarianceM2 = $util.emptyArray;
                SpatialBelief.prototype.status = "";

                SpatialBelief.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.entityId != null && $Object.hasOwnProperty.call(message, "entityId") && message.entityId !== "")
                        writer.uint32(10).string(message.entityId);
                    if (message.derivation != null && $Object.hasOwnProperty.call(message, "derivation"))
                        $root.blueswallow.vnext.v1.Derivation.encode(message.derivation, writer.uint32(18).fork(), _depth + 1).ldelim();
                    if (message.frameId != null && $Object.hasOwnProperty.call(message, "frameId") && message.frameId !== "")
                        writer.uint32(26).string(message.frameId);
                    if (message.positionM != null && message.positionM.length)
                        writer.uint32(34).doubles(message.positionM);
                    if (message.covarianceM2 != null && message.covarianceM2.length)
                        writer.uint32(42).doubles(message.covarianceM2);
                    if (message.status != null && $Object.hasOwnProperty.call(message, "status") && message.status !== "")
                        writer.uint32(50).string(message.status);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                SpatialBelief.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.SpatialBelief();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.entityId = value;
                                else
                                    delete message.entityId;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                message.derivation = $root.blueswallow.vnext.v1.Derivation.decode(reader, reader.size(), $undefined, _depth + 1, message.derivation);
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.frameId = value;
                                else
                                    delete message.frameId;
                                continue;
                            }
                        case 4: {
                                if (wireType === 2) {
                                    if (!(message.positionM && message.positionM.length))
                                        message.positionM = [];
                                    reader.doubles(message.positionM);
                                    continue;
                                }
                                if (wireType !== 1)
                                    break;
                                if (!(message.positionM && message.positionM.length))
                                    message.positionM = [];
                                message.positionM.push(reader.double());
                                continue;
                            }
                        case 5: {
                                if (wireType === 2) {
                                    if (!(message.covarianceM2 && message.covarianceM2.length))
                                        message.covarianceM2 = [];
                                    reader.doubles(message.covarianceM2);
                                    continue;
                                }
                                if (wireType !== 1)
                                    break;
                                if (!(message.covarianceM2 && message.covarianceM2.length))
                                    message.covarianceM2 = [];
                                message.covarianceM2.push(reader.double());
                                continue;
                            }
                        case 6: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.status = value;
                                else
                                    delete message.status;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return SpatialBelief;
            })();

            v1.OperatorAssertion = (function() {

                var OperatorAssertion = function (properties) {
                    this.inputIds = [];
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                OperatorAssertion.prototype.id = "";
                OperatorAssertion.prototype.sessionId = "";
                OperatorAssertion.prototype.assertion = "";
                OperatorAssertion.prototype.inputIds = $util.emptyArray;

                OperatorAssertion.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.id != null && $Object.hasOwnProperty.call(message, "id") && message.id !== "")
                        writer.uint32(10).string(message.id);
                    if (message.sessionId != null && $Object.hasOwnProperty.call(message, "sessionId") && message.sessionId !== "")
                        writer.uint32(18).string(message.sessionId);
                    if (message.assertion != null && $Object.hasOwnProperty.call(message, "assertion") && message.assertion !== "")
                        writer.uint32(26).string(message.assertion);
                    if (message.inputIds != null && message.inputIds.length)
                        for (var i = 0; i < message.inputIds.length; ++i)
                            writer.uint32(34).string(message.inputIds[i]);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                OperatorAssertion.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.OperatorAssertion();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.id = value;
                                else
                                    delete message.id;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.sessionId = value;
                                else
                                    delete message.sessionId;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.assertion = value;
                                else
                                    delete message.assertion;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.inputIds && message.inputIds.length))
                                    message.inputIds = [];
                                message.inputIds.push(reader.stringVerify());
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return OperatorAssertion;
            })();

            v1.DomainEvent = (function() {

                var DomainEvent = function (properties) {
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                DomainEvent.prototype.id = "";
                DomainEvent.prototype.eventType = "";
                DomainEvent.prototype.derivation = null;
                DomainEvent.prototype.payload = $util.newBuffer([]);

                DomainEvent.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.id != null && $Object.hasOwnProperty.call(message, "id") && message.id !== "")
                        writer.uint32(10).string(message.id);
                    if (message.eventType != null && $Object.hasOwnProperty.call(message, "eventType") && message.eventType !== "")
                        writer.uint32(18).string(message.eventType);
                    if (message.derivation != null && $Object.hasOwnProperty.call(message, "derivation"))
                        $root.blueswallow.vnext.v1.Derivation.encode(message.derivation, writer.uint32(26).fork(), _depth + 1).ldelim();
                    if (message.payload != null && $Object.hasOwnProperty.call(message, "payload") && message.payload.length)
                        writer.uint32(34).bytes(message.payload);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                DomainEvent.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.DomainEvent();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.id = value;
                                else
                                    delete message.id;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.eventType = value;
                                else
                                    delete message.eventType;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                message.derivation = $root.blueswallow.vnext.v1.Derivation.decode(reader, reader.size(), $undefined, _depth + 1, message.derivation);
                                continue;
                            }
                        case 4: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.bytes()).length)
                                    message.payload = value;
                                else
                                    delete message.payload;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return DomainEvent;
            })();

            v1.UserSettings = (function() {

                var UserSettings = function (properties) {
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                UserSettings.prototype.schemaVersion = 0;
                UserSettings.prototype.preferredMode = "";
                UserSettings.prototype.persistImu = false;
                UserSettings.prototype.networkSyncEnabled = false;
                UserSettings.prototype.recordingBudgetBytes = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                UserSettings.prototype.keepScreenOnForBle = false;
                UserSettings.prototype.backgroundBle = null;
                UserSettings.prototype.recordCallContext = false;

                var $oneOfFields;

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(UserSettings.prototype, "_backgroundBle", {
                    get: $util.oneOfGetter($oneOfFields = ["backgroundBle"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                UserSettings.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.schemaVersion != null && $Object.hasOwnProperty.call(message, "schemaVersion") && message.schemaVersion !== 0)
                        writer.uint32(8).uint32(message.schemaVersion);
                    if (message.preferredMode != null && $Object.hasOwnProperty.call(message, "preferredMode") && message.preferredMode !== "")
                        writer.uint32(18).string(message.preferredMode);
                    if (message.persistImu != null && $Object.hasOwnProperty.call(message, "persistImu") && message.persistImu !== false)
                        writer.uint32(24).bool(message.persistImu);
                    if (message.networkSyncEnabled != null && $Object.hasOwnProperty.call(message, "networkSyncEnabled") && message.networkSyncEnabled !== false)
                        writer.uint32(32).bool(message.networkSyncEnabled);
                    if (message.recordingBudgetBytes != null && $Object.hasOwnProperty.call(message, "recordingBudgetBytes") && (typeof message.recordingBudgetBytes === "object" ? message.recordingBudgetBytes.low || message.recordingBudgetBytes.high : message.recordingBudgetBytes !== 0))
                        writer.uint32(40).uint64(message.recordingBudgetBytes);
                    if (message.keepScreenOnForBle != null && $Object.hasOwnProperty.call(message, "keepScreenOnForBle") && message.keepScreenOnForBle !== false)
                        writer.uint32(48).bool(message.keepScreenOnForBle);
                    if (message.backgroundBle != null && $Object.hasOwnProperty.call(message, "backgroundBle"))
                        writer.uint32(56).bool(message.backgroundBle);
                    if (message.recordCallContext != null && $Object.hasOwnProperty.call(message, "recordCallContext") && message.recordCallContext !== false)
                        writer.uint32(64).bool(message.recordCallContext);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                UserSettings.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.UserSettings();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.uint32())
                                    message.schemaVersion = value;
                                else
                                    delete message.schemaVersion;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.preferredMode = value;
                                else
                                    delete message.preferredMode;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.bool())
                                    message.persistImu = value;
                                else
                                    delete message.persistImu;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.bool())
                                    message.networkSyncEnabled = value;
                                else
                                    delete message.networkSyncEnabled;
                                continue;
                            }
                        case 5: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.recordingBudgetBytes = value;
                                else
                                    delete message.recordingBudgetBytes;
                                continue;
                            }
                        case 6: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.bool())
                                    message.keepScreenOnForBle = value;
                                else
                                    delete message.keepScreenOnForBle;
                                continue;
                            }
                        case 7: {
                                if (wireType !== 0)
                                    break;
                                message.backgroundBle = reader.bool();
                                message._backgroundBle = "backgroundBle";
                                continue;
                            }
                        case 8: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.bool())
                                    message.recordCallContext = value;
                                else
                                    delete message.recordCallContext;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return UserSettings;
            })();

            v1.ControlSourceState = (function() {

                var ControlSourceState = function (properties) {
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                ControlSourceState.prototype.sourceId = "";
                ControlSourceState.prototype.kind = "";
                ControlSourceState.prototype.health = "";
                ControlSourceState.prototype.requestedIntervalMs = null;
                ControlSourceState.prototype.requestedPersist = false;
                ControlSourceState.prototype.appliedIntervalMs = null;
                ControlSourceState.prototype.appliedPersist = false;
                ControlSourceState.prototype.accepted = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                ControlSourceState.prototype.committed = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                ControlSourceState.prototype.liveOnly = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                ControlSourceState.prototype.dropped = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                ControlSourceState.prototype.availability = "";
                ControlSourceState.prototype.deliveredRecordsInWindow = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                ControlSourceState.prototype.deliveryWindowMs = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                ControlSourceState.prototype.deliveredRecordsPerSecond = null;
                ControlSourceState.prototype.lastArrivalAgeMs = null;
                ControlSourceState.prototype.registrationGeneration = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                ControlSourceState.prototype.registrationAgeMs = null;
                ControlSourceState.prototype.callbacksReceived = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                ControlSourceState.prototype.rateLimited = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                ControlSourceState.prototype.malformedCallbacks = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                ControlSourceState.prototype.requestedBleScope = "";
                ControlSourceState.prototype.appliedBleScope = "";
                ControlSourceState.prototype.wifiScan = null;
                ControlSourceState.prototype.latestAcquisitionAgeMs = null;
                ControlSourceState.prototype.requestedBleDuty = "";
                ControlSourceState.prototype.submittedBleDuty = "";

                var $oneOfFields;

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(ControlSourceState.prototype, "_requestedIntervalMs", {
                    get: $util.oneOfGetter($oneOfFields = ["requestedIntervalMs"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(ControlSourceState.prototype, "_appliedIntervalMs", {
                    get: $util.oneOfGetter($oneOfFields = ["appliedIntervalMs"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(ControlSourceState.prototype, "_deliveredRecordsPerSecond", {
                    get: $util.oneOfGetter($oneOfFields = ["deliveredRecordsPerSecond"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(ControlSourceState.prototype, "_lastArrivalAgeMs", {
                    get: $util.oneOfGetter($oneOfFields = ["lastArrivalAgeMs"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(ControlSourceState.prototype, "_registrationAgeMs", {
                    get: $util.oneOfGetter($oneOfFields = ["registrationAgeMs"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(ControlSourceState.prototype, "_wifiScan", {
                    get: $util.oneOfGetter($oneOfFields = ["wifiScan"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(ControlSourceState.prototype, "_latestAcquisitionAgeMs", {
                    get: $util.oneOfGetter($oneOfFields = ["latestAcquisitionAgeMs"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                ControlSourceState.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.sourceId != null && $Object.hasOwnProperty.call(message, "sourceId") && message.sourceId !== "")
                        writer.uint32(10).string(message.sourceId);
                    if (message.kind != null && $Object.hasOwnProperty.call(message, "kind") && message.kind !== "")
                        writer.uint32(18).string(message.kind);
                    if (message.health != null && $Object.hasOwnProperty.call(message, "health") && message.health !== "")
                        writer.uint32(26).string(message.health);
                    if (message.requestedIntervalMs != null && $Object.hasOwnProperty.call(message, "requestedIntervalMs"))
                        writer.uint32(32).int64(message.requestedIntervalMs);
                    if (message.requestedPersist != null && $Object.hasOwnProperty.call(message, "requestedPersist") && message.requestedPersist !== false)
                        writer.uint32(40).bool(message.requestedPersist);
                    if (message.appliedIntervalMs != null && $Object.hasOwnProperty.call(message, "appliedIntervalMs"))
                        writer.uint32(48).int64(message.appliedIntervalMs);
                    if (message.appliedPersist != null && $Object.hasOwnProperty.call(message, "appliedPersist") && message.appliedPersist !== false)
                        writer.uint32(56).bool(message.appliedPersist);
                    if (message.accepted != null && $Object.hasOwnProperty.call(message, "accepted") && (typeof message.accepted === "object" ? message.accepted.low || message.accepted.high : message.accepted !== 0))
                        writer.uint32(64).uint64(message.accepted);
                    if (message.committed != null && $Object.hasOwnProperty.call(message, "committed") && (typeof message.committed === "object" ? message.committed.low || message.committed.high : message.committed !== 0))
                        writer.uint32(72).uint64(message.committed);
                    if (message.liveOnly != null && $Object.hasOwnProperty.call(message, "liveOnly") && (typeof message.liveOnly === "object" ? message.liveOnly.low || message.liveOnly.high : message.liveOnly !== 0))
                        writer.uint32(80).uint64(message.liveOnly);
                    if (message.dropped != null && $Object.hasOwnProperty.call(message, "dropped") && (typeof message.dropped === "object" ? message.dropped.low || message.dropped.high : message.dropped !== 0))
                        writer.uint32(88).uint64(message.dropped);
                    if (message.availability != null && $Object.hasOwnProperty.call(message, "availability") && message.availability !== "")
                        writer.uint32(98).string(message.availability);
                    if (message.deliveredRecordsInWindow != null && $Object.hasOwnProperty.call(message, "deliveredRecordsInWindow") && (typeof message.deliveredRecordsInWindow === "object" ? message.deliveredRecordsInWindow.low || message.deliveredRecordsInWindow.high : message.deliveredRecordsInWindow !== 0))
                        writer.uint32(104).uint64(message.deliveredRecordsInWindow);
                    if (message.deliveryWindowMs != null && $Object.hasOwnProperty.call(message, "deliveryWindowMs") && (typeof message.deliveryWindowMs === "object" ? message.deliveryWindowMs.low || message.deliveryWindowMs.high : message.deliveryWindowMs !== 0))
                        writer.uint32(112).uint64(message.deliveryWindowMs);
                    if (message.deliveredRecordsPerSecond != null && $Object.hasOwnProperty.call(message, "deliveredRecordsPerSecond"))
                        writer.uint32(121).double(message.deliveredRecordsPerSecond);
                    if (message.lastArrivalAgeMs != null && $Object.hasOwnProperty.call(message, "lastArrivalAgeMs"))
                        writer.uint32(128).uint64(message.lastArrivalAgeMs);
                    if (message.registrationGeneration != null && $Object.hasOwnProperty.call(message, "registrationGeneration") && (typeof message.registrationGeneration === "object" ? message.registrationGeneration.low || message.registrationGeneration.high : message.registrationGeneration !== 0))
                        writer.uint32(136).uint64(message.registrationGeneration);
                    if (message.registrationAgeMs != null && $Object.hasOwnProperty.call(message, "registrationAgeMs"))
                        writer.uint32(144).uint64(message.registrationAgeMs);
                    if (message.callbacksReceived != null && $Object.hasOwnProperty.call(message, "callbacksReceived") && (typeof message.callbacksReceived === "object" ? message.callbacksReceived.low || message.callbacksReceived.high : message.callbacksReceived !== 0))
                        writer.uint32(152).uint64(message.callbacksReceived);
                    if (message.rateLimited != null && $Object.hasOwnProperty.call(message, "rateLimited") && (typeof message.rateLimited === "object" ? message.rateLimited.low || message.rateLimited.high : message.rateLimited !== 0))
                        writer.uint32(160).uint64(message.rateLimited);
                    if (message.malformedCallbacks != null && $Object.hasOwnProperty.call(message, "malformedCallbacks") && (typeof message.malformedCallbacks === "object" ? message.malformedCallbacks.low || message.malformedCallbacks.high : message.malformedCallbacks !== 0))
                        writer.uint32(168).uint64(message.malformedCallbacks);
                    if (message.requestedBleScope != null && $Object.hasOwnProperty.call(message, "requestedBleScope") && message.requestedBleScope !== "")
                        writer.uint32(178).string(message.requestedBleScope);
                    if (message.appliedBleScope != null && $Object.hasOwnProperty.call(message, "appliedBleScope") && message.appliedBleScope !== "")
                        writer.uint32(186).string(message.appliedBleScope);
                    if (message.wifiScan != null && $Object.hasOwnProperty.call(message, "wifiScan"))
                        $root.blueswallow.vnext.v1.WifiScanAccounting.encode(message.wifiScan, writer.uint32(194).fork(), _depth + 1).ldelim();
                    if (message.latestAcquisitionAgeMs != null && $Object.hasOwnProperty.call(message, "latestAcquisitionAgeMs"))
                        writer.uint32(200).uint64(message.latestAcquisitionAgeMs);
                    if (message.requestedBleDuty != null && $Object.hasOwnProperty.call(message, "requestedBleDuty") && message.requestedBleDuty !== "")
                        writer.uint32(210).string(message.requestedBleDuty);
                    if (message.submittedBleDuty != null && $Object.hasOwnProperty.call(message, "submittedBleDuty") && message.submittedBleDuty !== "")
                        writer.uint32(218).string(message.submittedBleDuty);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                ControlSourceState.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.ControlSourceState();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.sourceId = value;
                                else
                                    delete message.sourceId;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.kind = value;
                                else
                                    delete message.kind;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.health = value;
                                else
                                    delete message.health;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 0)
                                    break;
                                message.requestedIntervalMs = reader.int64();
                                message._requestedIntervalMs = "requestedIntervalMs";
                                continue;
                            }
                        case 5: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.bool())
                                    message.requestedPersist = value;
                                else
                                    delete message.requestedPersist;
                                continue;
                            }
                        case 6: {
                                if (wireType !== 0)
                                    break;
                                message.appliedIntervalMs = reader.int64();
                                message._appliedIntervalMs = "appliedIntervalMs";
                                continue;
                            }
                        case 7: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.bool())
                                    message.appliedPersist = value;
                                else
                                    delete message.appliedPersist;
                                continue;
                            }
                        case 8: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.accepted = value;
                                else
                                    delete message.accepted;
                                continue;
                            }
                        case 9: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.committed = value;
                                else
                                    delete message.committed;
                                continue;
                            }
                        case 10: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.liveOnly = value;
                                else
                                    delete message.liveOnly;
                                continue;
                            }
                        case 11: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.dropped = value;
                                else
                                    delete message.dropped;
                                continue;
                            }
                        case 12: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.availability = value;
                                else
                                    delete message.availability;
                                continue;
                            }
                        case 13: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.deliveredRecordsInWindow = value;
                                else
                                    delete message.deliveredRecordsInWindow;
                                continue;
                            }
                        case 14: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.deliveryWindowMs = value;
                                else
                                    delete message.deliveryWindowMs;
                                continue;
                            }
                        case 15: {
                                if (wireType !== 1)
                                    break;
                                message.deliveredRecordsPerSecond = reader.double();
                                message._deliveredRecordsPerSecond = "deliveredRecordsPerSecond";
                                continue;
                            }
                        case 16: {
                                if (wireType !== 0)
                                    break;
                                message.lastArrivalAgeMs = reader.uint64();
                                message._lastArrivalAgeMs = "lastArrivalAgeMs";
                                continue;
                            }
                        case 17: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.registrationGeneration = value;
                                else
                                    delete message.registrationGeneration;
                                continue;
                            }
                        case 18: {
                                if (wireType !== 0)
                                    break;
                                message.registrationAgeMs = reader.uint64();
                                message._registrationAgeMs = "registrationAgeMs";
                                continue;
                            }
                        case 19: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.callbacksReceived = value;
                                else
                                    delete message.callbacksReceived;
                                continue;
                            }
                        case 20: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.rateLimited = value;
                                else
                                    delete message.rateLimited;
                                continue;
                            }
                        case 21: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.malformedCallbacks = value;
                                else
                                    delete message.malformedCallbacks;
                                continue;
                            }
                        case 22: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.requestedBleScope = value;
                                else
                                    delete message.requestedBleScope;
                                continue;
                            }
                        case 23: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.appliedBleScope = value;
                                else
                                    delete message.appliedBleScope;
                                continue;
                            }
                        case 24: {
                                if (wireType !== 2)
                                    break;
                                message.wifiScan = $root.blueswallow.vnext.v1.WifiScanAccounting.decode(reader, reader.size(), $undefined, _depth + 1, message.wifiScan);
                                message._wifiScan = "wifiScan";
                                continue;
                            }
                        case 25: {
                                if (wireType !== 0)
                                    break;
                                message.latestAcquisitionAgeMs = reader.uint64();
                                message._latestAcquisitionAgeMs = "latestAcquisitionAgeMs";
                                continue;
                            }
                        case 26: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.requestedBleDuty = value;
                                else
                                    delete message.requestedBleDuty;
                                continue;
                            }
                        case 27: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.submittedBleDuty = value;
                                else
                                    delete message.submittedBleDuty;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return ControlSourceState;
            })();

            v1.WifiScanAccounting = (function() {

                var WifiScanAccounting = function (properties) {
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                WifiScanAccounting.prototype.accepted = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                WifiScanAccounting.prototype.rejected = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                WifiScanAccounting.prototype.errors = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                WifiScanAccounting.prototype.updated = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                WifiScanAccounting.prototype.notUpdated = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                WifiScanAccounting.prototype.callbackOverflow = null;
                WifiScanAccounting.prototype.callbackInvalid = null;
                WifiScanAccounting.prototype.callbackDiscarded = null;
                WifiScanAccounting.prototype.scheduledIntervalMs = null;
                WifiScanAccounting.prototype.adaptiveScheduling = null;
                WifiScanAccounting.prototype.rejectionBackoff = null;

                var $oneOfFields;

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(WifiScanAccounting.prototype, "_callbackOverflow", {
                    get: $util.oneOfGetter($oneOfFields = ["callbackOverflow"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(WifiScanAccounting.prototype, "_callbackInvalid", {
                    get: $util.oneOfGetter($oneOfFields = ["callbackInvalid"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(WifiScanAccounting.prototype, "_callbackDiscarded", {
                    get: $util.oneOfGetter($oneOfFields = ["callbackDiscarded"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(WifiScanAccounting.prototype, "_scheduledIntervalMs", {
                    get: $util.oneOfGetter($oneOfFields = ["scheduledIntervalMs"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(WifiScanAccounting.prototype, "_adaptiveScheduling", {
                    get: $util.oneOfGetter($oneOfFields = ["adaptiveScheduling"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(WifiScanAccounting.prototype, "_rejectionBackoff", {
                    get: $util.oneOfGetter($oneOfFields = ["rejectionBackoff"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                WifiScanAccounting.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.accepted != null && $Object.hasOwnProperty.call(message, "accepted") && (typeof message.accepted === "object" ? message.accepted.low || message.accepted.high : message.accepted !== 0))
                        writer.uint32(8).uint64(message.accepted);
                    if (message.rejected != null && $Object.hasOwnProperty.call(message, "rejected") && (typeof message.rejected === "object" ? message.rejected.low || message.rejected.high : message.rejected !== 0))
                        writer.uint32(16).uint64(message.rejected);
                    if (message.errors != null && $Object.hasOwnProperty.call(message, "errors") && (typeof message.errors === "object" ? message.errors.low || message.errors.high : message.errors !== 0))
                        writer.uint32(24).uint64(message.errors);
                    if (message.updated != null && $Object.hasOwnProperty.call(message, "updated") && (typeof message.updated === "object" ? message.updated.low || message.updated.high : message.updated !== 0))
                        writer.uint32(32).uint64(message.updated);
                    if (message.notUpdated != null && $Object.hasOwnProperty.call(message, "notUpdated") && (typeof message.notUpdated === "object" ? message.notUpdated.low || message.notUpdated.high : message.notUpdated !== 0))
                        writer.uint32(40).uint64(message.notUpdated);
                    if (message.callbackOverflow != null && $Object.hasOwnProperty.call(message, "callbackOverflow"))
                        writer.uint32(48).uint64(message.callbackOverflow);
                    if (message.callbackInvalid != null && $Object.hasOwnProperty.call(message, "callbackInvalid"))
                        writer.uint32(56).uint64(message.callbackInvalid);
                    if (message.callbackDiscarded != null && $Object.hasOwnProperty.call(message, "callbackDiscarded"))
                        writer.uint32(64).uint64(message.callbackDiscarded);
                    if (message.scheduledIntervalMs != null && $Object.hasOwnProperty.call(message, "scheduledIntervalMs"))
                        writer.uint32(72).uint64(message.scheduledIntervalMs);
                    if (message.adaptiveScheduling != null && $Object.hasOwnProperty.call(message, "adaptiveScheduling"))
                        writer.uint32(80).bool(message.adaptiveScheduling);
                    if (message.rejectionBackoff != null && $Object.hasOwnProperty.call(message, "rejectionBackoff"))
                        writer.uint32(88).bool(message.rejectionBackoff);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                WifiScanAccounting.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.WifiScanAccounting();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.accepted = value;
                                else
                                    delete message.accepted;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.rejected = value;
                                else
                                    delete message.rejected;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.errors = value;
                                else
                                    delete message.errors;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.updated = value;
                                else
                                    delete message.updated;
                                continue;
                            }
                        case 5: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.notUpdated = value;
                                else
                                    delete message.notUpdated;
                                continue;
                            }
                        case 6: {
                                if (wireType !== 0)
                                    break;
                                message.callbackOverflow = reader.uint64();
                                message._callbackOverflow = "callbackOverflow";
                                continue;
                            }
                        case 7: {
                                if (wireType !== 0)
                                    break;
                                message.callbackInvalid = reader.uint64();
                                message._callbackInvalid = "callbackInvalid";
                                continue;
                            }
                        case 8: {
                                if (wireType !== 0)
                                    break;
                                message.callbackDiscarded = reader.uint64();
                                message._callbackDiscarded = "callbackDiscarded";
                                continue;
                            }
                        case 9: {
                                if (wireType !== 0)
                                    break;
                                message.scheduledIntervalMs = reader.uint64();
                                message._scheduledIntervalMs = "scheduledIntervalMs";
                                continue;
                            }
                        case 10: {
                                if (wireType !== 0)
                                    break;
                                message.adaptiveScheduling = reader.bool();
                                message._adaptiveScheduling = "adaptiveScheduling";
                                continue;
                            }
                        case 11: {
                                if (wireType !== 0)
                                    break;
                                message.rejectionBackoff = reader.bool();
                                message._rejectionBackoff = "rejectionBackoff";
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return WifiScanAccounting;
            })();

            v1.CapturePolicyDecision = (function() {

                var CapturePolicyDecision = function (properties) {
                    this.sources = [];
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                CapturePolicyDecision.prototype.preferredMode = "";
                CapturePolicyDecision.prototype.persistImu = false;
                CapturePolicyDecision.prototype.settingsStatus = "";
                CapturePolicyDecision.prototype.budgetTier = "";
                CapturePolicyDecision.prototype.budgetReason = "";
                CapturePolicyDecision.prototype.cameraResumeRequired = false;
                CapturePolicyDecision.prototype.thermalStatus = 0;
                CapturePolicyDecision.prototype.batteryPercent = 0;
                CapturePolicyDecision.prototype.charging = false;
                CapturePolicyDecision.prototype.sources = $util.emptyArray;
                CapturePolicyDecision.prototype.policyVersion = "";
                CapturePolicyDecision.prototype.thermalHeadroom = null;
                CapturePolicyDecision.prototype.locationSessionEligible = null;
                CapturePolicyDecision.prototype.motionRecordingState = "";
                CapturePolicyDecision.prototype.motionAdmittedBytes = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                CapturePolicyDecision.prototype.motionAdmittedRecords = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                CapturePolicyDecision.prototype.motionLimitBytes = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                CapturePolicyDecision.prototype.motionLimitMs = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                CapturePolicyDecision.prototype.screenInteractive = null;
                CapturePolicyDecision.prototype.captureVersion = "";
                CapturePolicyDecision.prototype.captureSource = "";
                CapturePolicyDecision.prototype.keepScreenOnForBle = false;
                CapturePolicyDecision.prototype.displayAwakeRequested = null;
                CapturePolicyDecision.prototype.backgroundBle = false;
                CapturePolicyDecision.prototype.activityResumed = null;
                CapturePolicyDecision.prototype.bleFilterApiAvailable = null;
                CapturePolicyDecision.prototype.mobileCallContext = null;
                CapturePolicyDecision.prototype.storageCapacityReached = null;

                var $oneOfFields;

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(CapturePolicyDecision.prototype, "_thermalHeadroom", {
                    get: $util.oneOfGetter($oneOfFields = ["thermalHeadroom"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(CapturePolicyDecision.prototype, "_locationSessionEligible", {
                    get: $util.oneOfGetter($oneOfFields = ["locationSessionEligible"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(CapturePolicyDecision.prototype, "_screenInteractive", {
                    get: $util.oneOfGetter($oneOfFields = ["screenInteractive"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(CapturePolicyDecision.prototype, "_displayAwakeRequested", {
                    get: $util.oneOfGetter($oneOfFields = ["displayAwakeRequested"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(CapturePolicyDecision.prototype, "_activityResumed", {
                    get: $util.oneOfGetter($oneOfFields = ["activityResumed"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(CapturePolicyDecision.prototype, "_bleFilterApiAvailable", {
                    get: $util.oneOfGetter($oneOfFields = ["bleFilterApiAvailable"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(CapturePolicyDecision.prototype, "_mobileCallContext", {
                    get: $util.oneOfGetter($oneOfFields = ["mobileCallContext"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(CapturePolicyDecision.prototype, "_storageCapacityReached", {
                    get: $util.oneOfGetter($oneOfFields = ["storageCapacityReached"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                CapturePolicyDecision.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.preferredMode != null && $Object.hasOwnProperty.call(message, "preferredMode") && message.preferredMode !== "")
                        writer.uint32(10).string(message.preferredMode);
                    if (message.persistImu != null && $Object.hasOwnProperty.call(message, "persistImu") && message.persistImu !== false)
                        writer.uint32(16).bool(message.persistImu);
                    if (message.settingsStatus != null && $Object.hasOwnProperty.call(message, "settingsStatus") && message.settingsStatus !== "")
                        writer.uint32(26).string(message.settingsStatus);
                    if (message.budgetTier != null && $Object.hasOwnProperty.call(message, "budgetTier") && message.budgetTier !== "")
                        writer.uint32(34).string(message.budgetTier);
                    if (message.budgetReason != null && $Object.hasOwnProperty.call(message, "budgetReason") && message.budgetReason !== "")
                        writer.uint32(42).string(message.budgetReason);
                    if (message.cameraResumeRequired != null && $Object.hasOwnProperty.call(message, "cameraResumeRequired") && message.cameraResumeRequired !== false)
                        writer.uint32(48).bool(message.cameraResumeRequired);
                    if (message.thermalStatus != null && $Object.hasOwnProperty.call(message, "thermalStatus") && message.thermalStatus !== 0)
                        writer.uint32(56).int32(message.thermalStatus);
                    if (message.batteryPercent != null && $Object.hasOwnProperty.call(message, "batteryPercent") && message.batteryPercent !== 0)
                        writer.uint32(64).int32(message.batteryPercent);
                    if (message.charging != null && $Object.hasOwnProperty.call(message, "charging") && message.charging !== false)
                        writer.uint32(72).bool(message.charging);
                    if (message.sources != null && message.sources.length)
                        for (var i = 0; i < message.sources.length; ++i)
                            $root.blueswallow.vnext.v1.ControlSourceState.encode(message.sources[i], writer.uint32(82).fork(), _depth + 1).ldelim();
                    if (message.policyVersion != null && $Object.hasOwnProperty.call(message, "policyVersion") && message.policyVersion !== "")
                        writer.uint32(90).string(message.policyVersion);
                    if (message.thermalHeadroom != null && $Object.hasOwnProperty.call(message, "thermalHeadroom"))
                        writer.uint32(101).float(message.thermalHeadroom);
                    if (message.locationSessionEligible != null && $Object.hasOwnProperty.call(message, "locationSessionEligible"))
                        writer.uint32(104).bool(message.locationSessionEligible);
                    if (message.motionRecordingState != null && $Object.hasOwnProperty.call(message, "motionRecordingState") && message.motionRecordingState !== "")
                        writer.uint32(114).string(message.motionRecordingState);
                    if (message.motionAdmittedBytes != null && $Object.hasOwnProperty.call(message, "motionAdmittedBytes") && (typeof message.motionAdmittedBytes === "object" ? message.motionAdmittedBytes.low || message.motionAdmittedBytes.high : message.motionAdmittedBytes !== 0))
                        writer.uint32(120).uint64(message.motionAdmittedBytes);
                    if (message.motionAdmittedRecords != null && $Object.hasOwnProperty.call(message, "motionAdmittedRecords") && (typeof message.motionAdmittedRecords === "object" ? message.motionAdmittedRecords.low || message.motionAdmittedRecords.high : message.motionAdmittedRecords !== 0))
                        writer.uint32(128).uint64(message.motionAdmittedRecords);
                    if (message.motionLimitBytes != null && $Object.hasOwnProperty.call(message, "motionLimitBytes") && (typeof message.motionLimitBytes === "object" ? message.motionLimitBytes.low || message.motionLimitBytes.high : message.motionLimitBytes !== 0))
                        writer.uint32(136).uint64(message.motionLimitBytes);
                    if (message.motionLimitMs != null && $Object.hasOwnProperty.call(message, "motionLimitMs") && (typeof message.motionLimitMs === "object" ? message.motionLimitMs.low || message.motionLimitMs.high : message.motionLimitMs !== 0))
                        writer.uint32(144).uint64(message.motionLimitMs);
                    if (message.screenInteractive != null && $Object.hasOwnProperty.call(message, "screenInteractive"))
                        writer.uint32(152).bool(message.screenInteractive);
                    if (message.captureVersion != null && $Object.hasOwnProperty.call(message, "captureVersion") && message.captureVersion !== "")
                        writer.uint32(162).string(message.captureVersion);
                    if (message.captureSource != null && $Object.hasOwnProperty.call(message, "captureSource") && message.captureSource !== "")
                        writer.uint32(170).string(message.captureSource);
                    if (message.keepScreenOnForBle != null && $Object.hasOwnProperty.call(message, "keepScreenOnForBle") && message.keepScreenOnForBle !== false)
                        writer.uint32(176).bool(message.keepScreenOnForBle);
                    if (message.displayAwakeRequested != null && $Object.hasOwnProperty.call(message, "displayAwakeRequested"))
                        writer.uint32(184).bool(message.displayAwakeRequested);
                    if (message.backgroundBle != null && $Object.hasOwnProperty.call(message, "backgroundBle") && message.backgroundBle !== false)
                        writer.uint32(192).bool(message.backgroundBle);
                    if (message.activityResumed != null && $Object.hasOwnProperty.call(message, "activityResumed"))
                        writer.uint32(200).bool(message.activityResumed);
                    if (message.bleFilterApiAvailable != null && $Object.hasOwnProperty.call(message, "bleFilterApiAvailable"))
                        writer.uint32(208).bool(message.bleFilterApiAvailable);
                    if (message.mobileCallContext != null && $Object.hasOwnProperty.call(message, "mobileCallContext"))
                        writer.uint32(218).string(message.mobileCallContext);
                    if (message.storageCapacityReached != null && $Object.hasOwnProperty.call(message, "storageCapacityReached"))
                        writer.uint32(224).bool(message.storageCapacityReached);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                CapturePolicyDecision.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.CapturePolicyDecision();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.preferredMode = value;
                                else
                                    delete message.preferredMode;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.bool())
                                    message.persistImu = value;
                                else
                                    delete message.persistImu;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.settingsStatus = value;
                                else
                                    delete message.settingsStatus;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.budgetTier = value;
                                else
                                    delete message.budgetTier;
                                continue;
                            }
                        case 5: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.budgetReason = value;
                                else
                                    delete message.budgetReason;
                                continue;
                            }
                        case 6: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.bool())
                                    message.cameraResumeRequired = value;
                                else
                                    delete message.cameraResumeRequired;
                                continue;
                            }
                        case 7: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.thermalStatus = value;
                                else
                                    delete message.thermalStatus;
                                continue;
                            }
                        case 8: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.batteryPercent = value;
                                else
                                    delete message.batteryPercent;
                                continue;
                            }
                        case 9: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.bool())
                                    message.charging = value;
                                else
                                    delete message.charging;
                                continue;
                            }
                        case 10: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.sources && message.sources.length))
                                    message.sources = [];
                                message.sources.push($root.blueswallow.vnext.v1.ControlSourceState.decode(reader, reader.size(), $undefined, _depth + 1));
                                continue;
                            }
                        case 11: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.policyVersion = value;
                                else
                                    delete message.policyVersion;
                                continue;
                            }
                        case 12: {
                                if (wireType !== 5)
                                    break;
                                message.thermalHeadroom = reader.float();
                                message._thermalHeadroom = "thermalHeadroom";
                                continue;
                            }
                        case 13: {
                                if (wireType !== 0)
                                    break;
                                message.locationSessionEligible = reader.bool();
                                message._locationSessionEligible = "locationSessionEligible";
                                continue;
                            }
                        case 14: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.motionRecordingState = value;
                                else
                                    delete message.motionRecordingState;
                                continue;
                            }
                        case 15: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.motionAdmittedBytes = value;
                                else
                                    delete message.motionAdmittedBytes;
                                continue;
                            }
                        case 16: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.motionAdmittedRecords = value;
                                else
                                    delete message.motionAdmittedRecords;
                                continue;
                            }
                        case 17: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.motionLimitBytes = value;
                                else
                                    delete message.motionLimitBytes;
                                continue;
                            }
                        case 18: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.motionLimitMs = value;
                                else
                                    delete message.motionLimitMs;
                                continue;
                            }
                        case 19: {
                                if (wireType !== 0)
                                    break;
                                message.screenInteractive = reader.bool();
                                message._screenInteractive = "screenInteractive";
                                continue;
                            }
                        case 20: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.captureVersion = value;
                                else
                                    delete message.captureVersion;
                                continue;
                            }
                        case 21: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.captureSource = value;
                                else
                                    delete message.captureSource;
                                continue;
                            }
                        case 22: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.bool())
                                    message.keepScreenOnForBle = value;
                                else
                                    delete message.keepScreenOnForBle;
                                continue;
                            }
                        case 23: {
                                if (wireType !== 0)
                                    break;
                                message.displayAwakeRequested = reader.bool();
                                message._displayAwakeRequested = "displayAwakeRequested";
                                continue;
                            }
                        case 24: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.bool())
                                    message.backgroundBle = value;
                                else
                                    delete message.backgroundBle;
                                continue;
                            }
                        case 25: {
                                if (wireType !== 0)
                                    break;
                                message.activityResumed = reader.bool();
                                message._activityResumed = "activityResumed";
                                continue;
                            }
                        case 26: {
                                if (wireType !== 0)
                                    break;
                                message.bleFilterApiAvailable = reader.bool();
                                message._bleFilterApiAvailable = "bleFilterApiAvailable";
                                continue;
                            }
                        case 27: {
                                if (wireType !== 2)
                                    break;
                                message.mobileCallContext = reader.stringVerify();
                                message._mobileCallContext = "mobileCallContext";
                                continue;
                            }
                        case 28: {
                                if (wireType !== 0)
                                    break;
                                message.storageCapacityReached = reader.bool();
                                message._storageCapacityReached = "storageCapacityReached";
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return CapturePolicyDecision;
            })();

            v1.SourceHealthTransition = (function() {

                var SourceHealthTransition = function (properties) {
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                SourceHealthTransition.prototype.sourceId = "";
                SourceHealthTransition.prototype.kind = "";
                SourceHealthTransition.prototype.registrationGeneration = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                SourceHealthTransition.prototype.previousHealth = "";
                SourceHealthTransition.prototype.health = "";
                SourceHealthTransition.prototype.cause = "";
                SourceHealthTransition.prototype.observedElapsedNs = $util.Long ? $util.Long.fromBits(0,0,false) : 0;
                SourceHealthTransition.prototype.controlSequence = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                SourceHealthTransition.prototype.controlStage = "";

                SourceHealthTransition.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.sourceId != null && $Object.hasOwnProperty.call(message, "sourceId") && message.sourceId !== "")
                        writer.uint32(10).string(message.sourceId);
                    if (message.kind != null && $Object.hasOwnProperty.call(message, "kind") && message.kind !== "")
                        writer.uint32(18).string(message.kind);
                    if (message.registrationGeneration != null && $Object.hasOwnProperty.call(message, "registrationGeneration") && (typeof message.registrationGeneration === "object" ? message.registrationGeneration.low || message.registrationGeneration.high : message.registrationGeneration !== 0))
                        writer.uint32(24).uint64(message.registrationGeneration);
                    if (message.previousHealth != null && $Object.hasOwnProperty.call(message, "previousHealth") && message.previousHealth !== "")
                        writer.uint32(34).string(message.previousHealth);
                    if (message.health != null && $Object.hasOwnProperty.call(message, "health") && message.health !== "")
                        writer.uint32(42).string(message.health);
                    if (message.cause != null && $Object.hasOwnProperty.call(message, "cause") && message.cause !== "")
                        writer.uint32(50).string(message.cause);
                    if (message.observedElapsedNs != null && $Object.hasOwnProperty.call(message, "observedElapsedNs") && (typeof message.observedElapsedNs === "object" ? message.observedElapsedNs.low || message.observedElapsedNs.high : message.observedElapsedNs !== 0))
                        writer.uint32(56).int64(message.observedElapsedNs);
                    if (message.controlSequence != null && $Object.hasOwnProperty.call(message, "controlSequence") && (typeof message.controlSequence === "object" ? message.controlSequence.low || message.controlSequence.high : message.controlSequence !== 0))
                        writer.uint32(64).uint64(message.controlSequence);
                    if (message.controlStage != null && $Object.hasOwnProperty.call(message, "controlStage") && message.controlStage !== "")
                        writer.uint32(74).string(message.controlStage);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                SourceHealthTransition.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.SourceHealthTransition();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.sourceId = value;
                                else
                                    delete message.sourceId;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.kind = value;
                                else
                                    delete message.kind;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.registrationGeneration = value;
                                else
                                    delete message.registrationGeneration;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.previousHealth = value;
                                else
                                    delete message.previousHealth;
                                continue;
                            }
                        case 5: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.health = value;
                                else
                                    delete message.health;
                                continue;
                            }
                        case 6: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.cause = value;
                                else
                                    delete message.cause;
                                continue;
                            }
                        case 7: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.int64()) === "object" ? value.low || value.high : value !== 0)
                                    message.observedElapsedNs = value;
                                else
                                    delete message.observedElapsedNs;
                                continue;
                            }
                        case 8: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.controlSequence = value;
                                else
                                    delete message.controlSequence;
                                continue;
                            }
                        case 9: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.controlStage = value;
                                else
                                    delete message.controlStage;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return SourceHealthTransition;
            })();

            v1.SessionControlEvent = (function() {

                var SessionControlEvent = function (properties) {
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                SessionControlEvent.prototype.schemaVersion = 0;
                SessionControlEvent.prototype.id = "";
                SessionControlEvent.prototype.sessionId = "";
                SessionControlEvent.prototype.sequence = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                SessionControlEvent.prototype.stage = 0;
                SessionControlEvent.prototype.mode = "";
                SessionControlEvent.prototype.bootEpoch = "";
                SessionControlEvent.prototype.elapsedNs = $util.Long ? $util.Long.fromBits(0,0,false) : 0;
                SessionControlEvent.prototype.wallMs = $util.Long ? $util.Long.fromBits(0,0,false) : 0;
                SessionControlEvent.prototype.policy = null;
                SessionControlEvent.prototype.outcome = "";
                SessionControlEvent.prototype.healthTransition = null;
                SessionControlEvent.prototype.checkpointControlSequence = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                SessionControlEvent.prototype.checkpointControlStage = "";

                SessionControlEvent.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.schemaVersion != null && $Object.hasOwnProperty.call(message, "schemaVersion") && message.schemaVersion !== 0)
                        writer.uint32(8).uint32(message.schemaVersion);
                    if (message.id != null && $Object.hasOwnProperty.call(message, "id") && message.id !== "")
                        writer.uint32(18).string(message.id);
                    if (message.sessionId != null && $Object.hasOwnProperty.call(message, "sessionId") && message.sessionId !== "")
                        writer.uint32(26).string(message.sessionId);
                    if (message.sequence != null && $Object.hasOwnProperty.call(message, "sequence") && (typeof message.sequence === "object" ? message.sequence.low || message.sequence.high : message.sequence !== 0))
                        writer.uint32(32).uint64(message.sequence);
                    if (message.stage != null && $Object.hasOwnProperty.call(message, "stage") && message.stage !== 0)
                        writer.uint32(40).int32(message.stage);
                    if (message.mode != null && $Object.hasOwnProperty.call(message, "mode") && message.mode !== "")
                        writer.uint32(50).string(message.mode);
                    if (message.bootEpoch != null && $Object.hasOwnProperty.call(message, "bootEpoch") && message.bootEpoch !== "")
                        writer.uint32(58).string(message.bootEpoch);
                    if (message.elapsedNs != null && $Object.hasOwnProperty.call(message, "elapsedNs") && (typeof message.elapsedNs === "object" ? message.elapsedNs.low || message.elapsedNs.high : message.elapsedNs !== 0))
                        writer.uint32(64).int64(message.elapsedNs);
                    if (message.wallMs != null && $Object.hasOwnProperty.call(message, "wallMs") && (typeof message.wallMs === "object" ? message.wallMs.low || message.wallMs.high : message.wallMs !== 0))
                        writer.uint32(72).int64(message.wallMs);
                    if (message.policy != null && $Object.hasOwnProperty.call(message, "policy"))
                        $root.blueswallow.vnext.v1.CapturePolicyDecision.encode(message.policy, writer.uint32(82).fork(), _depth + 1).ldelim();
                    if (message.outcome != null && $Object.hasOwnProperty.call(message, "outcome") && message.outcome !== "")
                        writer.uint32(90).string(message.outcome);
                    if (message.healthTransition != null && $Object.hasOwnProperty.call(message, "healthTransition"))
                        $root.blueswallow.vnext.v1.SourceHealthTransition.encode(message.healthTransition, writer.uint32(98).fork(), _depth + 1).ldelim();
                    if (message.checkpointControlSequence != null && $Object.hasOwnProperty.call(message, "checkpointControlSequence") && (typeof message.checkpointControlSequence === "object" ? message.checkpointControlSequence.low || message.checkpointControlSequence.high : message.checkpointControlSequence !== 0))
                        writer.uint32(104).uint64(message.checkpointControlSequence);
                    if (message.checkpointControlStage != null && $Object.hasOwnProperty.call(message, "checkpointControlStage") && message.checkpointControlStage !== "")
                        writer.uint32(114).string(message.checkpointControlStage);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                SessionControlEvent.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.SessionControlEvent();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.uint32())
                                    message.schemaVersion = value;
                                else
                                    delete message.schemaVersion;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.id = value;
                                else
                                    delete message.id;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.sessionId = value;
                                else
                                    delete message.sessionId;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.sequence = value;
                                else
                                    delete message.sequence;
                                continue;
                            }
                        case 5: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.stage = value;
                                else
                                    delete message.stage;
                                continue;
                            }
                        case 6: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.mode = value;
                                else
                                    delete message.mode;
                                continue;
                            }
                        case 7: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.bootEpoch = value;
                                else
                                    delete message.bootEpoch;
                                continue;
                            }
                        case 8: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.int64()) === "object" ? value.low || value.high : value !== 0)
                                    message.elapsedNs = value;
                                else
                                    delete message.elapsedNs;
                                continue;
                            }
                        case 9: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.int64()) === "object" ? value.low || value.high : value !== 0)
                                    message.wallMs = value;
                                else
                                    delete message.wallMs;
                                continue;
                            }
                        case 10: {
                                if (wireType !== 2)
                                    break;
                                message.policy = $root.blueswallow.vnext.v1.CapturePolicyDecision.decode(reader, reader.size(), $undefined, _depth + 1, message.policy);
                                continue;
                            }
                        case 11: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.outcome = value;
                                else
                                    delete message.outcome;
                                continue;
                            }
                        case 12: {
                                if (wireType !== 2)
                                    break;
                                message.healthTransition = $root.blueswallow.vnext.v1.SourceHealthTransition.decode(reader, reader.size(), $undefined, _depth + 1, message.healthTransition);
                                continue;
                            }
                        case 13: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.checkpointControlSequence = value;
                                else
                                    delete message.checkpointControlSequence;
                                continue;
                            }
                        case 14: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.checkpointControlStage = value;
                                else
                                    delete message.checkpointControlStage;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                SessionControlEvent.Stage = (function() {
                    var valuesById = $Object.create(null), values = $Object.create(valuesById);
                    values[valuesById[0] = "UNKNOWN"] = 0;
                    values[valuesById[1] = "START"] = 1;
                    values[valuesById[2] = "REQUESTED"] = 2;
                    values[valuesById[3] = "APPLIED"] = 3;
                    values[valuesById[4] = "STOP"] = 4;
                    values[valuesById[5] = "HEALTH"] = 5;
                    values[valuesById[6] = "CHECKPOINT"] = 6;
                    return values;
                })();

                return SessionControlEvent;
            })();

            v1.ArchiveManifest = (function() {

                var ArchiveManifest = function (properties) {
                    this.sessionIds = [];
                    this.sourceIds = [];
                    this.legacySessionIds = [];
                    this.incompleteSessionIds = [];
                    this.externalModelSha256 = [];
                    this.externalDescriptorSha256 = [];
                    this.availableArtifactSha256 = [];
                    this.unavailableArtifacts = [];
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                ArchiveManifest.prototype.formatVersion = 0;
                ArchiveManifest.prototype.observationSchema = "";
                ArchiveManifest.prototype.recordCount = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                ArchiveManifest.prototype.recordsSha256 = $util.newBuffer([]);
                ArchiveManifest.prototype.sessionIds = $util.emptyArray;
                ArchiveManifest.prototype.sourceIds = $util.emptyArray;
                ArchiveManifest.prototype.timeConvention = "";
                ArchiveManifest.prototype.frameConvention = "";
                ArchiveManifest.prototype.evidenceCount = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                ArchiveManifest.prototype.sessionEventCount = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                ArchiveManifest.prototype.evidenceSchema = "";
                ArchiveManifest.prototype.controlSchema = "";
                ArchiveManifest.prototype.legacySessionIds = $util.emptyArray;
                ArchiveManifest.prototype.incompleteSessionIds = $util.emptyArray;
                ArchiveManifest.prototype.externalModelSha256 = $util.emptyArray;
                ArchiveManifest.prototype.externalDescriptorSha256 = $util.emptyArray;
                ArchiveManifest.prototype.artifactCount = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                ArchiveManifest.prototype.artifactChunkCount = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                ArchiveManifest.prototype.availableArtifactSha256 = $util.emptyArray;
                ArchiveManifest.prototype.unavailableArtifacts = $util.emptyArray;
                ArchiveManifest.prototype.unprovenVisualCount = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

                ArchiveManifest.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.formatVersion != null && $Object.hasOwnProperty.call(message, "formatVersion") && message.formatVersion !== 0)
                        writer.uint32(8).uint32(message.formatVersion);
                    if (message.observationSchema != null && $Object.hasOwnProperty.call(message, "observationSchema") && message.observationSchema !== "")
                        writer.uint32(18).string(message.observationSchema);
                    if (message.recordCount != null && $Object.hasOwnProperty.call(message, "recordCount") && (typeof message.recordCount === "object" ? message.recordCount.low || message.recordCount.high : message.recordCount !== 0))
                        writer.uint32(24).uint64(message.recordCount);
                    if (message.recordsSha256 != null && $Object.hasOwnProperty.call(message, "recordsSha256") && message.recordsSha256.length)
                        writer.uint32(34).bytes(message.recordsSha256);
                    if (message.sessionIds != null && message.sessionIds.length)
                        for (var i = 0; i < message.sessionIds.length; ++i)
                            writer.uint32(42).string(message.sessionIds[i]);
                    if (message.sourceIds != null && message.sourceIds.length)
                        for (var i = 0; i < message.sourceIds.length; ++i)
                            writer.uint32(50).string(message.sourceIds[i]);
                    if (message.timeConvention != null && $Object.hasOwnProperty.call(message, "timeConvention") && message.timeConvention !== "")
                        writer.uint32(58).string(message.timeConvention);
                    if (message.frameConvention != null && $Object.hasOwnProperty.call(message, "frameConvention") && message.frameConvention !== "")
                        writer.uint32(66).string(message.frameConvention);
                    if (message.evidenceCount != null && $Object.hasOwnProperty.call(message, "evidenceCount") && (typeof message.evidenceCount === "object" ? message.evidenceCount.low || message.evidenceCount.high : message.evidenceCount !== 0))
                        writer.uint32(72).uint64(message.evidenceCount);
                    if (message.sessionEventCount != null && $Object.hasOwnProperty.call(message, "sessionEventCount") && (typeof message.sessionEventCount === "object" ? message.sessionEventCount.low || message.sessionEventCount.high : message.sessionEventCount !== 0))
                        writer.uint32(80).uint64(message.sessionEventCount);
                    if (message.evidenceSchema != null && $Object.hasOwnProperty.call(message, "evidenceSchema") && message.evidenceSchema !== "")
                        writer.uint32(90).string(message.evidenceSchema);
                    if (message.controlSchema != null && $Object.hasOwnProperty.call(message, "controlSchema") && message.controlSchema !== "")
                        writer.uint32(98).string(message.controlSchema);
                    if (message.legacySessionIds != null && message.legacySessionIds.length)
                        for (var i = 0; i < message.legacySessionIds.length; ++i)
                            writer.uint32(106).string(message.legacySessionIds[i]);
                    if (message.incompleteSessionIds != null && message.incompleteSessionIds.length)
                        for (var i = 0; i < message.incompleteSessionIds.length; ++i)
                            writer.uint32(114).string(message.incompleteSessionIds[i]);
                    if (message.externalModelSha256 != null && message.externalModelSha256.length)
                        for (var i = 0; i < message.externalModelSha256.length; ++i)
                            writer.uint32(122).string(message.externalModelSha256[i]);
                    if (message.externalDescriptorSha256 != null && message.externalDescriptorSha256.length)
                        for (var i = 0; i < message.externalDescriptorSha256.length; ++i)
                            writer.uint32(130).string(message.externalDescriptorSha256[i]);
                    if (message.artifactCount != null && $Object.hasOwnProperty.call(message, "artifactCount") && (typeof message.artifactCount === "object" ? message.artifactCount.low || message.artifactCount.high : message.artifactCount !== 0))
                        writer.uint32(136).uint64(message.artifactCount);
                    if (message.artifactChunkCount != null && $Object.hasOwnProperty.call(message, "artifactChunkCount") && (typeof message.artifactChunkCount === "object" ? message.artifactChunkCount.low || message.artifactChunkCount.high : message.artifactChunkCount !== 0))
                        writer.uint32(144).uint64(message.artifactChunkCount);
                    if (message.availableArtifactSha256 != null && message.availableArtifactSha256.length)
                        for (var i = 0; i < message.availableArtifactSha256.length; ++i)
                            writer.uint32(154).string(message.availableArtifactSha256[i]);
                    if (message.unavailableArtifacts != null && message.unavailableArtifacts.length)
                        for (var i = 0; i < message.unavailableArtifacts.length; ++i)
                            $root.blueswallow.vnext.v1.UnavailableArtifact.encode(message.unavailableArtifacts[i], writer.uint32(162).fork(), _depth + 1).ldelim();
                    if (message.unprovenVisualCount != null && $Object.hasOwnProperty.call(message, "unprovenVisualCount") && (typeof message.unprovenVisualCount === "object" ? message.unprovenVisualCount.low || message.unprovenVisualCount.high : message.unprovenVisualCount !== 0))
                        writer.uint32(168).uint64(message.unprovenVisualCount);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                ArchiveManifest.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.ArchiveManifest();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.uint32())
                                    message.formatVersion = value;
                                else
                                    delete message.formatVersion;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.observationSchema = value;
                                else
                                    delete message.observationSchema;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.recordCount = value;
                                else
                                    delete message.recordCount;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.bytes()).length)
                                    message.recordsSha256 = value;
                                else
                                    delete message.recordsSha256;
                                continue;
                            }
                        case 5: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.sessionIds && message.sessionIds.length))
                                    message.sessionIds = [];
                                message.sessionIds.push(reader.stringVerify());
                                continue;
                            }
                        case 6: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.sourceIds && message.sourceIds.length))
                                    message.sourceIds = [];
                                message.sourceIds.push(reader.stringVerify());
                                continue;
                            }
                        case 7: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.timeConvention = value;
                                else
                                    delete message.timeConvention;
                                continue;
                            }
                        case 8: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.frameConvention = value;
                                else
                                    delete message.frameConvention;
                                continue;
                            }
                        case 9: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.evidenceCount = value;
                                else
                                    delete message.evidenceCount;
                                continue;
                            }
                        case 10: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.sessionEventCount = value;
                                else
                                    delete message.sessionEventCount;
                                continue;
                            }
                        case 11: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.evidenceSchema = value;
                                else
                                    delete message.evidenceSchema;
                                continue;
                            }
                        case 12: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.controlSchema = value;
                                else
                                    delete message.controlSchema;
                                continue;
                            }
                        case 13: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.legacySessionIds && message.legacySessionIds.length))
                                    message.legacySessionIds = [];
                                message.legacySessionIds.push(reader.stringVerify());
                                continue;
                            }
                        case 14: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.incompleteSessionIds && message.incompleteSessionIds.length))
                                    message.incompleteSessionIds = [];
                                message.incompleteSessionIds.push(reader.stringVerify());
                                continue;
                            }
                        case 15: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.externalModelSha256 && message.externalModelSha256.length))
                                    message.externalModelSha256 = [];
                                message.externalModelSha256.push(reader.stringVerify());
                                continue;
                            }
                        case 16: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.externalDescriptorSha256 && message.externalDescriptorSha256.length))
                                    message.externalDescriptorSha256 = [];
                                message.externalDescriptorSha256.push(reader.stringVerify());
                                continue;
                            }
                        case 17: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.artifactCount = value;
                                else
                                    delete message.artifactCount;
                                continue;
                            }
                        case 18: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.artifactChunkCount = value;
                                else
                                    delete message.artifactChunkCount;
                                continue;
                            }
                        case 19: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.availableArtifactSha256 && message.availableArtifactSha256.length))
                                    message.availableArtifactSha256 = [];
                                message.availableArtifactSha256.push(reader.stringVerify());
                                continue;
                            }
                        case 20: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.unavailableArtifacts && message.unavailableArtifacts.length))
                                    message.unavailableArtifacts = [];
                                message.unavailableArtifacts.push($root.blueswallow.vnext.v1.UnavailableArtifact.decode(reader, reader.size(), $undefined, _depth + 1));
                                continue;
                            }
                        case 21: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.unprovenVisualCount = value;
                                else
                                    delete message.unprovenVisualCount;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return ArchiveManifest;
            })();

            v1.UnavailableArtifact = (function() {

                var UnavailableArtifact = function (properties) {
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                UnavailableArtifact.prototype.sha256 = "";
                UnavailableArtifact.prototype.reason = "";

                UnavailableArtifact.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.sha256 != null && $Object.hasOwnProperty.call(message, "sha256") && message.sha256 !== "")
                        writer.uint32(10).string(message.sha256);
                    if (message.reason != null && $Object.hasOwnProperty.call(message, "reason") && message.reason !== "")
                        writer.uint32(18).string(message.reason);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                UnavailableArtifact.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.UnavailableArtifact();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.sha256 = value;
                                else
                                    delete message.sha256;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.reason = value;
                                else
                                    delete message.reason;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return UnavailableArtifact;
            })();

            v1.ArtifactChunk = (function() {

                var ArtifactChunk = function (properties) {
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                ArtifactChunk.prototype.sha256 = "";
                ArtifactChunk.prototype.offset = 0;
                ArtifactChunk.prototype.totalBytes = 0;
                ArtifactChunk.prototype.content = $util.newBuffer([]);

                ArtifactChunk.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.sha256 != null && $Object.hasOwnProperty.call(message, "sha256") && message.sha256 !== "")
                        writer.uint32(10).string(message.sha256);
                    if (message.offset != null && $Object.hasOwnProperty.call(message, "offset") && message.offset !== 0)
                        writer.uint32(16).uint32(message.offset);
                    if (message.totalBytes != null && $Object.hasOwnProperty.call(message, "totalBytes") && message.totalBytes !== 0)
                        writer.uint32(24).uint32(message.totalBytes);
                    if (message.content != null && $Object.hasOwnProperty.call(message, "content") && message.content.length)
                        writer.uint32(34).bytes(message.content);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                ArtifactChunk.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.ArtifactChunk();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.sha256 = value;
                                else
                                    delete message.sha256;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.uint32())
                                    message.offset = value;
                                else
                                    delete message.offset;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.uint32())
                                    message.totalBytes = value;
                                else
                                    delete message.totalBytes;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.bytes()).length)
                                    message.content = value;
                                else
                                    delete message.content;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return ArtifactChunk;
            })();

            v1.ArchiveEntry = (function() {

                var ArchiveEntry = function (properties) {
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                ArchiveEntry.prototype.manifest = null;
                ArchiveEntry.prototype.observation = null;
                ArchiveEntry.prototype.evidence = null;
                ArchiveEntry.prototype.sessionEvent = null;
                ArchiveEntry.prototype.artifactChunk = null;

                var $oneOfFields;

                $Object.defineProperty(ArchiveEntry.prototype, "entry", {
                    get: $util.oneOfGetter($oneOfFields = ["manifest", "observation", "evidence", "sessionEvent", "artifactChunk"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                ArchiveEntry.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.manifest != null && $Object.hasOwnProperty.call(message, "manifest"))
                        $root.blueswallow.vnext.v1.ArchiveManifest.encode(message.manifest, writer.uint32(10).fork(), _depth + 1).ldelim();
                    if (message.observation != null && $Object.hasOwnProperty.call(message, "observation"))
                        writer.uint32(18).bytes(message.observation);
                    if (message.evidence != null && $Object.hasOwnProperty.call(message, "evidence"))
                        writer.uint32(26).bytes(message.evidence);
                    if (message.sessionEvent != null && $Object.hasOwnProperty.call(message, "sessionEvent"))
                        writer.uint32(34).bytes(message.sessionEvent);
                    if (message.artifactChunk != null && $Object.hasOwnProperty.call(message, "artifactChunk"))
                        $root.blueswallow.vnext.v1.ArtifactChunk.encode(message.artifactChunk, writer.uint32(42).fork(), _depth + 1).ldelim();
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                ArchiveEntry.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.ArchiveEntry();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                message.manifest = $root.blueswallow.vnext.v1.ArchiveManifest.decode(reader, reader.size(), $undefined, _depth + 1, message.manifest);
                                message.entry = "manifest";
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                message.observation = reader.bytes();
                                message.entry = "observation";
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                message.evidence = reader.bytes();
                                message.entry = "evidence";
                                continue;
                            }
                        case 4: {
                                if (wireType !== 2)
                                    break;
                                message.sessionEvent = reader.bytes();
                                message.entry = "sessionEvent";
                                continue;
                            }
                        case 5: {
                                if (wireType !== 2)
                                    break;
                                message.artifactChunk = $root.blueswallow.vnext.v1.ArtifactChunk.decode(reader, reader.size(), $undefined, _depth + 1, message.artifactChunk);
                                message.entry = "artifactChunk";
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return ArchiveEntry;
            })();

            v1.Rtl433Record = (function() {

                var Rtl433Record = function (properties) {
                    if (properties)
                        for (var keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                Rtl433Record.prototype.originalJson = $util.newBuffer([]);
                Rtl433Record.prototype.model = "";
                Rtl433Record.prototype.protocol = "";
                Rtl433Record.prototype.advertisedId = "";
                Rtl433Record.prototype.channel = "";
                Rtl433Record.prototype.foreignTimestamp = "";
                Rtl433Record.prototype.helperId = "";
                Rtl433Record.prototype.hardware = "";
                Rtl433Record.prototype.decoderVersion = "";
                Rtl433Record.prototype.connectionEpoch = "";
                Rtl433Record.prototype.sequence = $util.Long ? $util.Long.fromBits(0,0,true) : 0;
                Rtl433Record.prototype.frequencyHz = null;
                Rtl433Record.prototype.signalDb = null;
                Rtl433Record.prototype.signalReference = "";
                Rtl433Record.prototype.temperatureKelvin = null;
                Rtl433Record.prototype.pressurePascal = null;
                Rtl433Record.prototype.humidityPercent = null;

                var $oneOfFields;

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Rtl433Record.prototype, "_frequencyHz", {
                    get: $util.oneOfGetter($oneOfFields = ["frequencyHz"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Rtl433Record.prototype, "_signalDb", {
                    get: $util.oneOfGetter($oneOfFields = ["signalDb"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Rtl433Record.prototype, "_temperatureKelvin", {
                    get: $util.oneOfGetter($oneOfFields = ["temperatureKelvin"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Rtl433Record.prototype, "_pressurePascal", {
                    get: $util.oneOfGetter($oneOfFields = ["pressurePascal"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                // Virtual OneOf for proto3 optional field
                $Object.defineProperty(Rtl433Record.prototype, "_humidityPercent", {
                    get: $util.oneOfGetter($oneOfFields = ["humidityPercent"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                Rtl433Record.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.originalJson != null && $Object.hasOwnProperty.call(message, "originalJson") && message.originalJson.length)
                        writer.uint32(10).bytes(message.originalJson);
                    if (message.model != null && $Object.hasOwnProperty.call(message, "model") && message.model !== "")
                        writer.uint32(18).string(message.model);
                    if (message.protocol != null && $Object.hasOwnProperty.call(message, "protocol") && message.protocol !== "")
                        writer.uint32(26).string(message.protocol);
                    if (message.advertisedId != null && $Object.hasOwnProperty.call(message, "advertisedId") && message.advertisedId !== "")
                        writer.uint32(34).string(message.advertisedId);
                    if (message.channel != null && $Object.hasOwnProperty.call(message, "channel") && message.channel !== "")
                        writer.uint32(42).string(message.channel);
                    if (message.foreignTimestamp != null && $Object.hasOwnProperty.call(message, "foreignTimestamp") && message.foreignTimestamp !== "")
                        writer.uint32(50).string(message.foreignTimestamp);
                    if (message.helperId != null && $Object.hasOwnProperty.call(message, "helperId") && message.helperId !== "")
                        writer.uint32(58).string(message.helperId);
                    if (message.hardware != null && $Object.hasOwnProperty.call(message, "hardware") && message.hardware !== "")
                        writer.uint32(66).string(message.hardware);
                    if (message.decoderVersion != null && $Object.hasOwnProperty.call(message, "decoderVersion") && message.decoderVersion !== "")
                        writer.uint32(74).string(message.decoderVersion);
                    if (message.connectionEpoch != null && $Object.hasOwnProperty.call(message, "connectionEpoch") && message.connectionEpoch !== "")
                        writer.uint32(82).string(message.connectionEpoch);
                    if (message.sequence != null && $Object.hasOwnProperty.call(message, "sequence") && (typeof message.sequence === "object" ? message.sequence.low || message.sequence.high : message.sequence !== 0))
                        writer.uint32(88).uint64(message.sequence);
                    if (message.frequencyHz != null && $Object.hasOwnProperty.call(message, "frequencyHz"))
                        writer.uint32(97).double(message.frequencyHz);
                    if (message.signalDb != null && $Object.hasOwnProperty.call(message, "signalDb"))
                        writer.uint32(105).double(message.signalDb);
                    if (message.signalReference != null && $Object.hasOwnProperty.call(message, "signalReference") && message.signalReference !== "")
                        writer.uint32(114).string(message.signalReference);
                    if (message.temperatureKelvin != null && $Object.hasOwnProperty.call(message, "temperatureKelvin"))
                        writer.uint32(121).double(message.temperatureKelvin);
                    if (message.pressurePascal != null && $Object.hasOwnProperty.call(message, "pressurePascal"))
                        writer.uint32(129).double(message.pressurePascal);
                    if (message.humidityPercent != null && $Object.hasOwnProperty.call(message, "humidityPercent"))
                        writer.uint32(137).double(message.humidityPercent);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (var i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                Rtl433Record.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    var end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.blueswallow.vnext.v1.Rtl433Record();
                    while (reader.pos < end) {
                        var start = reader.pos;
                        var tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        var wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.bytes()).length)
                                    message.originalJson = value;
                                else
                                    delete message.originalJson;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.model = value;
                                else
                                    delete message.model;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.protocol = value;
                                else
                                    delete message.protocol;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.advertisedId = value;
                                else
                                    delete message.advertisedId;
                                continue;
                            }
                        case 5: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.channel = value;
                                else
                                    delete message.channel;
                                continue;
                            }
                        case 6: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.foreignTimestamp = value;
                                else
                                    delete message.foreignTimestamp;
                                continue;
                            }
                        case 7: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.helperId = value;
                                else
                                    delete message.helperId;
                                continue;
                            }
                        case 8: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.hardware = value;
                                else
                                    delete message.hardware;
                                continue;
                            }
                        case 9: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.decoderVersion = value;
                                else
                                    delete message.decoderVersion;
                                continue;
                            }
                        case 10: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.connectionEpoch = value;
                                else
                                    delete message.connectionEpoch;
                                continue;
                            }
                        case 11: {
                                if (wireType !== 0)
                                    break;
                                if (typeof (value = reader.uint64()) === "object" ? value.low || value.high : value !== 0)
                                    message.sequence = value;
                                else
                                    delete message.sequence;
                                continue;
                            }
                        case 12: {
                                if (wireType !== 1)
                                    break;
                                message.frequencyHz = reader.double();
                                message._frequencyHz = "frequencyHz";
                                continue;
                            }
                        case 13: {
                                if (wireType !== 1)
                                    break;
                                message.signalDb = reader.double();
                                message._signalDb = "signalDb";
                                continue;
                            }
                        case 14: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.signalReference = value;
                                else
                                    delete message.signalReference;
                                continue;
                            }
                        case 15: {
                                if (wireType !== 1)
                                    break;
                                message.temperatureKelvin = reader.double();
                                message._temperatureKelvin = "temperatureKelvin";
                                continue;
                            }
                        case 16: {
                                if (wireType !== 1)
                                    break;
                                message.pressurePascal = reader.double();
                                message._pressurePascal = "pressurePascal";
                                continue;
                            }
                        case 17: {
                                if (wireType !== 1)
                                    break;
                                message.humidityPercent = reader.double();
                                message._humidityPercent = "humidityPercent";
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return Rtl433Record;
            })();

            return v1;
        })();

        return vnext;
    })();

    return blueswallow;
})();

module.exports = $root;
