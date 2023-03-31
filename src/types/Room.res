type t = {
  controller: StructureController.t,
  energyAvailable: int,
  energyCapacityAvailable: int,
  memory: Memory.room,
  name: string,
  storage: StructureStorage.t,
  terminal: StructureTerminal.t,
  visual: RoomVisual.t,
}

module Types = {
    type findPathOpts = {
      ignoreCreeps?: bool,
      ignoreDestructibleStructures: bool,
      ignoreRoads?: bool,
      // TODO: costCallback:
    }
    type path
    type pathString = string
}

@send external serializePath: (~room: t, ~path: Types.findPathOpts) => Types.pathString = "serializePath"

@send external deserializePath: (~room: t, ~path: Types.pathString) => Types.path = "deserializePath"

// @send external createConstructionSite: 

@send
external findPath: (
  ~room: t,
  ~toPath: RoomPosition.t,
  ~toPos: RoomPosition.t,
  ~opts: Types.findPathOpts,
) => Types.path = "findPath"
