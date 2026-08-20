export interface GodotRuntimeGenerationOptions {
  namespace?: string;
  className?: string;
}

/**
 * Generate a dependency-free C# runtime bridge that a Godot C# host can wrap.
 * The generated layer deliberately uses object/Action instead of importing
 * Godot assemblies, so it can be compiled in CI and embedded into a Godot
 * project without forcing the compiler package to depend on a Godot SDK.
 */
export function generateGodotRuntime(options: GodotRuntimeGenerationOptions = {}): string {
  const namespaceName = options.namespace ?? "Badodo.Generated";
  const className = options.className ?? "BadodoRuntime";
  assertIdentifier(namespaceName, "namespace");
  assertIdentifier(className, "className");
  return `#nullable enable
using System;
using System.Collections.Generic;

namespace ${namespaceName};

public sealed class ${className}
{
  private readonly Dictionary<string, object?> _nodes = new(StringComparer.Ordinal);
  private readonly Dictionary<(string Node, string Event), List<Action<object?>>> _handlers = new();
  private readonly List<Action<double>> _frameHandlers = new();

  public double Time { get; private set; }

  public void RegisterNode(string name, object node)
  {
    if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Node name is required", nameof(name));
    _nodes[name] = node ?? throw new ArgumentNullException(nameof(node));
  }

  public object ResolveNode(string name) => _nodes.TryGetValue(name, out var node)
    ? node!
    : throw new KeyNotFoundException($"Badodo node '{name}' was not registered");

  public T ResolveNode<T>(string name) => (T)ResolveNode(name);

  public void On(string node, string eventName, Action<object?> handler)
  {
    var key = (node, eventName);
    if (!_handlers.TryGetValue(key, out var handlers)) _handlers[key] = handlers = new();
    handlers.Add(handler);
  }

  public void Emit(string node, string eventName, object? value = null)
  {
    if (!_handlers.TryGetValue((node, eventName), out var handlers)) return;
    foreach (var handler in handlers.ToArray()) handler(value);
  }

  public void OnFrame(Action<double> handler) => _frameHandlers.Add(handler);

  public void Tick(double deltaSeconds)
  {
    if (deltaSeconds < 0 || double.IsNaN(deltaSeconds) || double.IsInfinity(deltaSeconds))
      throw new ArgumentOutOfRangeException(nameof(deltaSeconds));
    Time += deltaSeconds;
    foreach (var handler in _frameHandlers.ToArray()) handler(Time);
  }
}
`;
}

function assertIdentifier(value: string, label: string): void {
  if (!value || value.split(".").some((part) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(part))) {
    throw new Error(`Invalid C# ${label}: ${value}`);
  }
}
