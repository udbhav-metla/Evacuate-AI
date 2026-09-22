/**
 * Simulation Engine for Physical Agent Egress Dynamics
 * Executes continuous, deterministic kinematic progression along graph trajectories.
 */

import { EvacuationGraph } from '../graph/types';
import { FloorId } from '../types/building';
import { AgentGenerator } from './generator';
import { AgentStatus, SimulatedAgent, SimulationMetrics } from './types';

export class SimulationEngine {
  /**
   * Generates a fresh set of agents using deterministic seed
   */
  public static initPopulation(
    graph: EvacuationGraph,
    count = 150,
    seed = 42
  ): SimulatedAgent[] {
    return AgentGenerator.generateFleet(graph, count, seed);
  }

  /**
   * Resets all agents to their initial spawn positions and idle states
   */
  public static resetAgents(agents: SimulatedAgent[]): SimulatedAgent[] {
    return agents.map((agent) => ({
      ...agent,
      status: 'idle',
      currentFloor: agent.spawnFloor,
      position: { ...agent.spawnPosition },
      currentNodeId: `NODE_${agent.spawnRoomId}`,
      currentWaypointIndex: 1,
      currentSpeed: agent.walkingSpeed,
      reactionRemaining: agent.reactionTime,
      distanceTraveled: 0,
      evacuationTime: undefined,
    }));
  }

  /**
   * Advances the simulation by dt seconds with physically grounded kinematics (no teleportation)
   */
  public static step(
    agents: SimulatedAgent[],
    dt: number,
    elapsedTime: number
  ): { updatedAgents: SimulatedAgent[]; newElapsedTime: number; metrics: SimulationMetrics } {
    const newElapsedTime = Number((elapsedTime + dt).toFixed(2));
    let totalEvacuatedTime = 0;
    let evacuatedCount = 0;
    let reactingCount = 0;

    const updatedAgents: SimulatedAgent[] = agents.map((agent): SimulatedAgent => {
      // 1. Evacuated agents remain safe outside
      if (agent.status === 'evacuated') {
        evacuatedCount++;
        totalEvacuatedTime += agent.evacuationTime || 0;
        return agent;
      }

      // 2. Idle agents transition to reacting upon alarm activation
      let status: AgentStatus = agent.status;
      let reactionRemaining = agent.reactionRemaining;

      if (status === 'idle') {
        status = 'reacting';
      }

      if (status === 'reacting') {
        reactionRemaining -= dt;
        if (reactionRemaining <= 0) {
          status = 'evacuating';
          reactionRemaining = 0;
        } else {
          reactingCount++;
          return {
            ...agent,
            status,
            reactionRemaining: Number(reactionRemaining.toFixed(2)),
          };
        }
      }

      // 3. Evacuating agents: continuous kinematic movement along waypoints
      if (status === 'evacuating') {
        let { currentWaypointIndex, position, currentFloor, distanceTraveled } = agent;
        const waypoints = agent.routeWaypoints;

        if (currentWaypointIndex >= waypoints.length) {
          // Reached final exit waypoint!
          evacuatedCount++;
          const evacTime = newElapsedTime;
          totalEvacuatedTime += evacTime;
          return {
            ...agent,
            status: 'evacuated',
            evacuationTime: evacTime,
          };
        }

        const targetWp = waypoints[currentWaypointIndex];
        const dx = targetWp.x - position.x;
        const dy = targetWp.y - position.y;
        const dz = targetWp.z - position.z;
        const dist = Math.hypot(dx, dy, dz);

        // Calculate actual speed: descending stairs has reduced speed
        const isStairs = Math.abs(dy) > 0.4;
        const currentSpeed = isStairs ? agent.walkingSpeed * 0.55 : agent.walkingSpeed;

        const moveDist = currentSpeed * dt;

        if (moveDist >= dist || dist < 0.05) {
          // Arrived at current waypoint! Advance to next waypoint
          position = { ...targetWp };
          distanceTraveled += dist;
          currentWaypointIndex++;

          // Derive current floor level from Y coordinate
          const calculatedFloor = Math.max(
            1,
            Math.min(5, Math.round(position.y / 4.0) + 1)
          ) as FloorId;
          currentFloor = calculatedFloor;

          if (currentWaypointIndex >= waypoints.length) {
            // Reached external discharge exit!
            evacuatedCount++;
            const evacTime = newElapsedTime;
            totalEvacuatedTime += evacTime;
            return {
              ...agent,
              status: 'evacuated' as AgentStatus,
              currentFloor: 1,
              position,
              currentWaypointIndex,
              distanceTraveled: Number(distanceTraveled.toFixed(2)),
              evacuationTime: evacTime,
            };
          }

          return {
            ...agent,
            position,
            currentFloor,
            currentWaypointIndex,
            currentSpeed: Number(currentSpeed.toFixed(2)),
            distanceTraveled: Number(distanceTraveled.toFixed(2)),
          };
        } else {
          // Continuous interpolation along line segment between waypoints
          const ratio = moveDist / dist;
          const newX = position.x + dx * ratio;
          const newY = position.y + dy * ratio;
          const newZ = position.z + dz * ratio;

          const calculatedFloor = Math.max(
            1,
            Math.min(5, Math.round(newY / 4.0) + 1)
          ) as FloorId;

          return {
            ...agent,
            position: {
              x: Number(newX.toFixed(3)),
              y: Number(newY.toFixed(3)),
              z: Number(newZ.toFixed(3)),
            },
            currentFloor: calculatedFloor,
            currentSpeed: Number(currentSpeed.toFixed(2)),
            distanceTraveled: Number((distanceTraveled + moveDist).toFixed(2)),
          };
        }
      }

      return agent;
    });

    const totalAgents = agents.length;
    const remainingAgents = totalAgents - evacuatedCount;
    const averageEvacuationTime =
      evacuatedCount > 0 ? Number((totalEvacuatedTime / evacuatedCount).toFixed(1)) : 0;
    const evacuationProgress = Number(((evacuatedCount / totalAgents) * 100).toFixed(1));

    const metrics: SimulationMetrics = {
      totalAgents,
      evacuatedAgents: evacuatedCount,
      remainingAgents,
      reactingAgents: reactingCount,
      elapsedTime: newElapsedTime,
      averageEvacuationTime,
      evacuationProgress,
    };

    return { updatedAgents, newElapsedTime, metrics };
  }
}
