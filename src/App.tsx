import { useEffect, useState } from 'react'
import Whiteboard from './components/Whiteboard'
import { blink } from './blink/client'

function App() {
  const [user, setUser] = useState<any | null>(null)

  useEffect(() => {
    let isMounted = true

    const fetchUser = async () => {
      try {
        const authUser = await blink.auth.me()
        if (isMounted) setUser(authUser)
      } catch (error) {
        console.error('Failed to fetch user:', error)
      }
    }

    fetchUser()

    const unsubscribe = blink.auth.onAuthStateChanged((state) => {
      if (isMounted) setUser(state?.user || null)
    })

    return () => {
      isMounted = false
      unsubscribe?.()
    }
  }, [])

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        Loading...
      </div>
    )
  }

  return <Whiteboard user={user} />
}

export default App