/**
 * EVACUATE-AI // PHASE 3
 * Agent-Based Evacuation Simulation & Digital Twin Visualization
 */

import React, { useEffect, useRef } from 'react';
import { BuildingScene } from './components/3d/BuildingScene';
import { Header } from './components/ui/Header';
import { FloorSelector } from './components/ui/FloorSelector';
import { ObjectInspector } from './components/ui/ObjectInspector';
import { DebugPanel } from './components/debug/DebugPanel';
import { SimulationControls } from './components/simulation/SimulationControls';
import { useEvacuateStore } from './store/useEvacuateStore';

export default function App() {
  const {
    calculateRoute,
    simulationState,
    simulationConfig,
    stepSimulation,
  } = useEvacuateStore();

  const lastTimeRef = useRef<number | null>(null);

  // On mount, calculate initial baseline route
  useEffect(() => {
    calculateRoute();
  }, [calculateRoute]);

  // Continuous physics / kinematics simulation loop
  useEffect(() => {
    let animFrameId: number;

    const loop = (currentTime: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = currentTime;
      }

      const elapsedSec = (currentTime - lastTimeRef.current) / 1000;
      lastTimeRef.current = currentTime;

      if (simulationState === 'running') {
        // Prevent delta time spikes if browser tab was backgrounded (cap at 0.1s)
        const cappedDt = Math.min(elapsedSec, 0.1);
        const effectiveDt = cappedDt * simulationConfig.simulationSpeed;
        stepSimulation(effectiveDt);
      }

      animFrameId = requestAnimationFrame(loop);
    };

    animFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animFrameId);
      lastTimeRef.current = null;
    };
  }, [simulationState, simulationConfig.simulationSpeed, stepSimulation]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans">
      {/* Top Application Bar */}
      <Header />

      {/* 3D Digital Twin & Graph Viewport */}
      <main className="w-full h-full">
        <BuildingScene />
      </main>

      {/* Floor Slicing Controls (F1 - F5, ALL) */}
      <FloorSelector />

      {/* Real-time Agent & Entity Inspector */}
      <ObjectInspector />

      {/* Simulation Controls & Egress Telemetry HUD */}
      <SimulationControls />

      {/* Developer & Graph Debug Panel */}
      <DebugPanel />
    </div>
  );
}
