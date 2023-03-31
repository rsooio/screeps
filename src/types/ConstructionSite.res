type buildable =
  | STRUCTURE_EXTENSION
  | STRUCTURE_RAMPART
  | STRUCTURE_ROAD
  | STRUCTURE_SPAWN
  | STRUCTURE_LINK
  | STRUCTURE_WALL
  | STRUCTURE_STORAGE
  | STRUCTURE_TOWER
  | STRUCTURE_OBSERVER
  | STRUCTURE_POWER_SPAWN
  | STRUCTURE_EXTRACTOR
  | STRUCTURE_LAB
  | STRUCTURE_TERMINAL
  | STRUCTURE_CONTAINER
  | STRUCTURE_NUKER
  | STRUCTURE_FACTORY

type remove =
  | OK
  | ERR_NOT_OWNER

type t = {
  effects: array<Effect.t>,
  pos: RoomPosition.t,
  rool?: Room.t,
  id: string,
  my: bool,
  owner: Utils.owner,
  progress: float,
  progressTotal: float,
  structureType: buildable,
  remove: () => remove
}
