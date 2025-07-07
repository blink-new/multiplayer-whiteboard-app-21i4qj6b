import { useEffect, useRef, useState } from 'react'
import { blink } from '../blink/client'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Separator } from './ui/separator'
import { Badge } from './ui/badge'
import { 
  Pen, 
  Eraser, 
  Undo2, 
  Trash2, 
  Circle,
  Users,
  Palette
} from 'lucide-react'
import { cn } from '../lib/utils'
import toast from 'react-hot-toast'

interface DrawingData {
  id: string
  type: 'draw' | 'erase'
  points: Array<{ x: number; y: number }>
  color: string
  size: number
  timestamp: number
}

interface User {
  userId: string
  metadata?: {
    displayName?: string
    cursor?: { x: number; y: number }
  }
}

interface AuthUser {
  id: string
  email?: string
  displayName?: string
}

interface WhiteboardProps {
  user: AuthUser
}

const COLORS = ['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8800']

export default function Whiteboard({ user }: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [color, setColor] = useState('#000000')
  const [size, setSize] = useState(3)
  const [currentStroke, setCurrentStroke] = useState<Array<{ x: number; y: number }>>([])
  const [onlineUsers, setOnlineUsers] = useState<User[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const drawingHistory = useRef<DrawingData[]>([])
  const channelRef = useRef<ReturnType<typeof blink.realtime.channel> | null>(null)

  useEffect(() => {
    let isMounted = true
    const channel = blink.realtime.channel('whiteboard-room')
    channelRef.current = channel
    channel.subscribe({
      userId: user.id,
      metadata: {
        displayName: user.email?.split('@')[0] || 'Anonymous',
        cursor: { x: 0, y: 0 }
      }
    }).then(() => {
      if (!isMounted) return
      setIsConnected(true)
      toast.success('Connected to whiteboard!')
    }).catch((error) => {
      if (!isMounted) return
      console.error('Failed to connect to whiteboard:', error)
      toast.error('Failed to connect to whiteboard')
    })

    channel.onMessage((message: {
      type: string;
      userId: string;
      data: DrawingData;
    }) => {
      if (message.type === 'draw' && message.userId !== user.id) {
        drawRemoteStroke(message.data)
      } else if (message.type === 'clear') {
        clearCanvas()
      }
    })
    channel.onPresence((users: User[]) => {
      setOnlineUsers(users)
    })

    return () => {
      isMounted = false
      channel.unsubscribe()
    }
  }, [user.id])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    // Set initial canvas style
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }, [])

  const getCanvasCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX
    const clientY = 'touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    }
  }

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isConnected) return
    
    setIsDrawing(true)
    const point = getCanvasCoordinates(e)
    setCurrentStroke([point])
    
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !isConnected) return

    const point = getCanvasCoordinates(e)
    setCurrentStroke(prev => [...prev, point])

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    if (tool === 'pen') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = color
      ctx.lineWidth = size
    } else {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.lineWidth = size * 2
    }

    ctx.lineTo(point.x, point.y)
    ctx.stroke()
  }

  const stopDrawing = async () => {
    if (!isDrawing || !isConnected || currentStroke.length === 0) return

    setIsDrawing(false)
    
    const drawingData: DrawingData = {
      id: Date.now().toString(),
      type: tool === 'pen' ? 'draw' : 'erase',
      points: currentStroke,
      color,
      size,
      timestamp: Date.now()
    }

    drawingHistory.current.push(drawingData)
    
    // Send to other users
    if (channelRef.current) {
      await channelRef.current.publish('draw', drawingData, {
        userId: user.id,
      })
    }
    setCurrentStroke([])
  }

  const drawRemoteStroke = (data: DrawingData) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || data.points.length === 0) return

    ctx.beginPath()
    ctx.moveTo(data.points[0].x, data.points[0].y)

    if (data.type === 'draw') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = data.color
      ctx.lineWidth = data.size
    } else {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.lineWidth = data.size * 2
    }

    data.points.forEach(point => {
      ctx.lineTo(point.x, point.y)
    })
    
    ctx.stroke()
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    drawingHistory.current = []
  }

  const handleClear = async () => {
    if (!isConnected) return
    
    clearCanvas()
    if (channelRef.current) {
      await channelRef.current.publish('clear', {}, { userId: user.id })
    }
    toast.success('Canvas cleared')
  }

  const handleUndo = () => {
    if (drawingHistory.current.length === 0) return
    
    drawingHistory.current.pop()
    redrawCanvas()
  }

  const redrawCanvas = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    clearCanvas()
    
    drawingHistory.current.forEach(data => {
      drawRemoteStroke(data)
    })
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b shadow-sm">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold text-gray-900">Collaborative Whiteboard</h1>
          <Badge variant="outline" className="flex items-center space-x-1">
            <Circle className={cn("w-2 h-2", isConnected ? "fill-green-500 text-green-500" : "fill-red-500 text-red-500")} />
            <span>{isConnected ? "Connected" : "Disconnected"}</span>
          </Badge>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600">{onlineUsers.length} online</span>
          </div>
          {user && (
            <div className="text-sm text-gray-600">
              Welcome, {user.email?.split('@')[0] || 'Anonymous'}!
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Toolbar */}
        <Card className="m-4 p-4 w-64 h-fit">
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Tools</h3>
              <div className="flex space-x-2">
                <Button
                  variant={tool === 'pen' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTool('pen')}
                  className="flex items-center space-x-1"
                >
                  <Pen className="w-4 h-4" />
                  <span>Pen</span>
                </Button>
                <Button
                  variant={tool === 'eraser' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTool('eraser')}
                  className="flex items-center space-x-1"
                >
                  <Eraser className="w-4 h-4" />
                  <span>Eraser</span>
                </Button>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2 flex items-center space-x-1">
                <Palette className="w-4 h-4" />
                <span>Colors</span>
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 hover:scale-110 transition-transform",
                      color === c ? "border-gray-900" : "border-gray-300"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">Size</h3>
              <input
                type="range"
                min="1"
                max="20"
                value={size}
                onChange={(e) => setSize(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="text-center text-sm text-gray-600 mt-1">{size}px</div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleUndo}
                disabled={!isConnected || drawingHistory.current.length === 0}
                className="w-full flex items-center space-x-1"
              >
                <Undo2 className="w-4 h-4" />
                <span>Undo</span>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClear}
                disabled={!isConnected}
                className="w-full flex items-center space-x-1"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear All</span>
              </Button>
            </div>
          </div>
        </Card>

        {/* Canvas */}
        <div className="flex-1 p-4">
          <div className="relative w-full h-full bg-white rounded-lg shadow-lg overflow-hidden">
            <canvas
              ref={canvasRef}
              className="absolute inset-0 cursor-crosshair"
              style={{ width: '100%', height: '100%' }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
            
            {/* Online users indicator */}
            {onlineUsers.length > 0 && (
              <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-3">
                <div className="text-sm font-semibold mb-2">Online Users</div>
                <div className="space-y-1">
                  {onlineUsers.map((user) => (
                    <div key={user.userId} className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm">{user.metadata?.displayName || 'Anonymous'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}