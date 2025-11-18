import React, { useEffect, useMemo, useRef, useState } from 'react'
import Spline from '@splinetool/react-spline'
import { Home, Trophy, Users, Activity, Loader2 } from 'lucide-react'
import { initializeApp, getApps } from 'firebase/app'
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth'
import { getFirestore, collection, doc, getDocs, getDoc, onSnapshot, query, setDoc, where, addDoc, serverTimestamp } from 'firebase/firestore'

// Color tokens (Brand): saffron/gold, emerald green, dark navy/black
const colors = {
  accent: '#F59E0B', // saffron/gold
  secondary: '#10B981', // emerald
  bg: '#0B1220', // dark navy
  card: 'rgba(17, 24, 39, 0.7)',
  text: '#E5E7EB',
}

function useFirebase() {
  const [state, setState] = useState({ app: null, db: null, auth: null, user: null, appId: null, status: 'init', error: null })

  useEffect(() => {
    async function init() {
      try {
        const appId = window.__app_id
        const firebaseConfig = window.__firebase_config
        const initialToken = window.__initial_auth_token
        if (!appId || !firebaseConfig) {
          setState((s) => ({ ...s, status: 'error', error: 'Missing __app_id or __firebase_config on window.' }))
          return
        }
        const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
        const auth = getAuth(app)
        const db = getFirestore(app)

        setState((s) => ({ ...s, app, auth, db, appId, status: 'authing' }))

        // Auth flow: try custom token, fallback to anonymous
        if (initialToken) {
          try {
            await signInWithCustomToken(auth, initialToken)
          } catch (e) {
            console.warn('Custom token sign-in failed, falling back to anonymous.', e)
            await signInAnonymously(auth)
          }
        } else {
          await signInAnonymously(auth)
        }

        const unsub = onAuthStateChanged(auth, (user) => {
          setState((s) => ({ ...s, user, status: user ? 'ready' : 'authing' }))
        })
        return () => unsub()
      } catch (error) {
        console.error(error)
        setState((s) => ({ ...s, status: 'error', error: String(error?.message || error) }))
      }
    }
    init()
  }, [])

  return state
}

// Firestore path helpers
function useJplRefs(db, appId) {
  return useMemo(() => {
    if (!db || !appId) return null
    const baseDoc = doc(db, 'artifacts', appId, 'public', 'data', 'jpl_stats')
    const col = (name) => collection(baseDoc, name)
    const metaDoc = (name) => doc(collection(baseDoc, 'meta'), name)
    return { baseDoc, col, metaDoc }
  }, [db, appId])
}

// Seed initial data if empty
async function seedInitialDataIfNeeded(db, appId, uid) {
  const baseDoc = doc(db, 'artifacts', appId, 'public', 'data', 'jpl_stats')
  const teamsCol = collection(baseDoc, 'teams')
  const playersCol = collection(baseDoc, 'players')
  const matchesCol = collection(baseDoc, 'matches')
  const fixturesCol = collection(baseDoc, 'fixtures')
  const metaCol = collection(baseDoc, 'meta')

  const teamsSnap = await getDocs(teamsCol)
  if (!teamsSnap.empty) return // already seeded

  const teamNames = [
    'Jain Stallions',
    'Solar Titans',
    'Emerald Strikers',
    'Dharma Dynamos',
    'Ahimsa Aces',
    'Unity Warriors',
    'Jinendra Jaguars',
    'Ratnatraya Riders',
  ]

  // Create 8 teams
  const teamIds = []
  for (let i = 0; i < teamNames.length; i++) {
    const tId = `team_${i + 1}`
    teamIds.push(tId)
    await setDoc(doc(teamsCol, tId), {
      id: tId,
      name: teamNames[i],
      logoUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(teamNames[i])}`,
      colors: {
        primary: colors.accent,
        secondary: colors.secondary,
      },
      slogan: 'Play with passion. Win with honor.',
      createdAt: serverTimestamp(),
    })
  }

  // Create 30 players across teams with mock stats
  const roles = ['Batsman', 'Bowler', 'All-rounder']
  for (let i = 1; i <= 30; i++) {
    const teamId = teamIds[(i - 1) % teamIds.length]
    const role = roles[i % roles.length]
    await setDoc(doc(playersCol, `player_${i}`), {
      id: `player_${i}`,
      teamId,
      name: `Player ${i}`,
      role,
      photoUrl: `https://api.dicebear.com/7.x/thumbs/svg?seed=Player${i}`,
      batting: {
        runs: Math.floor(Math.random() * 400) + 50,
        avg: Number((Math.random() * 40 + 10).toFixed(2)),
        sr: Number((Math.random() * 80 + 80).toFixed(2)),
        fifties: Math.floor(Math.random() * 5),
        hundreds: Math.random() < 0.2 ? 1 : 0,
        fours: Math.floor(Math.random() * 50),
        sixes: Math.floor(Math.random() * 30),
        highest: Math.floor(Math.random() * 80) + 20,
      },
      bowling: {
        wickets: Math.floor(Math.random() * 25),
        avg: Number((Math.random() * 25 + 10).toFixed(2)),
        economy: Number((Math.random() * 6 + 4).toFixed(2)),
        best: `${Math.floor(Math.random() * 5) + 1}/${Math.floor(Math.random() * 20) + 10}`,
      },
      createdAt: serverTimestamp(),
    })
  }

  // Create 2 matches (1 completed, 1 upcoming)
  const match1 = {
    id: 'match_1',
    status: 'completed',
    info: {
      date: new Date().toISOString(),
      venue: 'JPL Arena',
      teams: { a: teamIds[0], b: teamIds[1] },
      toss: { winner: teamIds[0], decision: 'bat' },
    },
    summary: {
      winner: teamIds[0],
      margin: '15 runs',
      playerOfTheMatch: 'Player 5',
    },
    liveState: null,
    scorecards: {
      innings: [
        { teamId: teamIds[0], runs: 168, wickets: 6, overs: 20.0 },
        { teamId: teamIds[1], runs: 153, wickets: 8, overs: 20.0 },
      ],
      batsmen: [],
      bowlers: [],
    },
    commentary: [
      { over: 19.6, text: 'Match over! Jain Stallions win by 15 runs.' },
      { over: 19.4, text: 'Dot ball. Pressure on the Titans.' },
      { over: 18.2, text: 'FOUR! Crunched through covers.' },
    ],
    createdAt: serverTimestamp(),
  }

  const match2 = {
    id: 'match_2',
    status: 'upcoming',
    info: {
      date: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      venue: 'Harmony Stadium',
      teams: { a: teamIds[2], b: teamIds[3] },
      toss: null,
    },
    liveState: {
      over: 0.0,
      runs: 0,
      wickets: 0,
      currentBatsmen: [],
      currentBowler: null,
    },
    scorecards: null,
    commentary: [],
    createdAt: serverTimestamp(),
  }

  await setDoc(doc(matchesCol, match1.id), match1)
  await setDoc(doc(matchesCol, match2.id), match2)

  // Fixtures mirror matches status
  await setDoc(doc(fixturesCol, match1.id), { id: match1.id, date: match1.info.date, teams: match1.info.teams, venue: match1.info.venue, status: 'completed' })
  await setDoc(doc(fixturesCol, match2.id), { id: match2.id, date: match2.info.date, teams: match2.info.teams, venue: match2.info.venue, status: 'upcoming' })

  // Points table
  const points = teamIds.map((id, idx) => ({
    teamId: id,
    P: 1,
    W: idx === 0 ? 1 : 0,
    L: idx === 1 ? 1 : 0,
    NR: 0,
    Pts: idx === 0 ? 2 : 0,
    NRR: idx === 0 ? 0.75 : idx === 1 ? -0.35 : 0,
  }))
  await setDoc(doc(metaCol, 'points_table'), { entries: points, updatedAt: serverTimestamp() })

  // Leaderboards (basic)
  await setDoc(doc(metaCol, 'leaderboards'), {
    topRuns: Array.from({ length: 10 }).map((_, i) => ({ playerId: `player_${i + 1}` })),
    topWickets: Array.from({ length: 10 }).map((_, i) => ({ playerId: `player_${i + 11}` })),
    mostSixes: Array.from({ length: 10 }).map((_, i) => ({ playerId: `player_${i + 1}`, sixes: Math.floor(Math.random() * 30) })),
    mostFours: Array.from({ length: 10 }).map((_, i) => ({ playerId: `player_${i + 1}`, fours: Math.floor(Math.random() * 50) })),
    bestFigures: Array.from({ length: 10 }).map((_, i) => ({ playerId: `player_${i + 1}`, best: `${Math.floor(Math.random() * 5) + 1}/${Math.floor(Math.random() * 20) + 10}` })),
    updatedAt: serverTimestamp(),
  })

  // Create a default public fantasy contest for match_2
  const contestsCol = collection(baseDoc, 'fantasy_contests')
  await setDoc(doc(contestsCol, 'contest_1'), {
    id: 'contest_1',
    matchId: 'match_2',
    name: 'JPL Freeplay',
    isPublic: true,
    prizeInfo: null,
    status: 'open',
    createdAt: serverTimestamp(),
  })

  // Initialize fantasy scores doc for live leaderboard
  await setDoc(doc(metaCol, 'fantasy_scores_match_2'), { userScores: {}, updatedAt: serverTimestamp() })
}

function BottomNav({ current, onChange }) {
  const items = [
    { key: 'home', label: 'Home', icon: Home },
    { key: 'scores', label: 'Scores', icon: Activity },
    { key: 'fantasy', label: 'Fantasy', icon: Trophy },
    { key: 'teams', label: 'Teams', icon: Users },
  ]
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30">
      <div className="mx-auto max-w-md">
        <div className="m-3 rounded-2xl bg-slate-800/80 backdrop-blur border border-slate-700 flex overflow-hidden">
          {items.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 transition ${
                current === key ? 'text-amber-400' : 'text-slate-300'
              }`}
            >
              <Icon size={20} />
              <span className="text-xs">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function HomeHero() {
  return (
    <div className="relative w-full h-[52vh] sm:h-[58vh] overflow-hidden rounded-b-3xl">
      <div className="absolute inset-0">
        <Spline scene="https://prod.spline.design/4Tf9WOIaWs6LOezG/scene.splinecode" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
      <div className="absolute bottom-6 left-6 right-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white drop-shadow">Jain Premier League • Season 9</h1>
        <p className="mt-2 text-slate-200">Real-time scores, fantasy, and rich stats — live and instant.</p>
      </div>
    </div>
  )
}

function ScoresView({ dbRefs }) {
  const [matches, setMatches] = useState([])
  const [points, setPoints] = useState([])

  useEffect(() => {
    if (!dbRefs) return
    const unsubMatches = onSnapshot(dbRefs.col('matches'), (snap) => {
      const list = []
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }))
      // Show live first, then upcoming, then completed
      list.sort((a, b) => {
        const order = { live: 0, upcoming: 1, completed: 2 }
        return (order[a.status] ?? 3) - (order[b.status] ?? 3)
      })
      setMatches(list)
    })
    const unsubPoints = onSnapshot(dbRefs.metaDoc('points_table'), (docSnap) => {
      const data = docSnap.data()
      setPoints(data?.entries || [])
    })
    return () => {
      unsubMatches && unsubMatches()
      unsubPoints && unsubPoints()
    }
  }, [dbRefs])

  return (
    <div className="p-4 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Match Center</h2>
        <div className="mt-3 grid gap-3">
          {matches.map((m) => (
            <div key={m.id} className="rounded-xl bg-slate-800/60 border border-slate-700 p-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 text-sm">{new Date(m?.info?.date).toLocaleString()}</span>
                <span className={`text-xs px-2 py-1 rounded-full ${m.status === 'completed' ? 'bg-slate-700 text-slate-300' : m.status === 'upcoming' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>{m.status.toUpperCase()}</span>
              </div>
              <div className="mt-2 text-white font-medium">
                {m?.info?.teams?.a} vs {m?.info?.teams?.b}
              </div>
              {m.liveState && (
                <div className="mt-3 text-amber-300 text-sm">
                  Live: {m.liveState.runs}/{m.liveState.wickets} in {m.liveState.over} overs
                </div>
              )}
              {m.summary && (
                <div className="mt-2 text-slate-300 text-sm">Winner: {m.summary.winner} • {m.summary.margin}</div>
              )}
              {Array.isArray(m.commentary) && m.commentary.length > 0 && (
                <div className="mt-3 text-slate-300 text-xs max-h-20 overflow-y-auto space-y-1">
                  {m.commentary.slice(0, 4).map((c, idx) => (
                    <div key={idx}>• {c.text}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="pb-20">
        <h2 className="text-lg font-semibold text-white">Points Table</h2>
        <div className="mt-3 grid gap-2">
          {points.map((p, idx) => (
            <div key={p.teamId} className="rounded-xl bg-slate-800/60 border border-slate-700 p-3 flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <span className="text-slate-400">{idx + 1}</span>
                <span className="text-white font-medium">{p.teamId}</span>
              </div>
              <div className="text-slate-300">P:{p.P} • W:{p.W} • L:{p.L} • NR:{p.NR} • Pts:{p.Pts} • NRR:{p.NRR}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FantasyView({ dbRefs, user }) {
  const [contest, setContest] = useState(null)
  const [players, setPlayers] = useState([])
  const [team, setTeam] = useState([])
  const [scores, setScores] = useState({})
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)

  const maxPlayers = 11
  const budgetCap = 100

  useEffect(() => {
    if (!dbRefs) return
    const unsubContest = onSnapshot(doc(dbRefs.col('fantasy_contests'), 'contest_1'), (d) => setContest({ id: d.id, ...d.data() }))
    const unsubPlayers = onSnapshot(dbRefs.col('players'), (snap) => {
      const list = []
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }))
      setPlayers(list)
    })
    const unsubScores = onSnapshot(dbRefs.metaDoc('fantasy_scores_match_2'), (d) => setScores(d.data()?.userScores || {}))
    return () => {
      unsubContest && unsubContest()
      unsubPlayers && unsubPlayers()
      unsubScores && unsubScores()
    }
  }, [dbRefs])

  const budgetUsed = useMemo(() => {
    // simple mock credit: Batsman 7, Bowler 8, All-rounder 9
    return team.reduce((sum, p) => sum + (p.role === 'Batsman' ? 7 : p.role === 'Bowler' ? 8 : 9), 0)
  }, [team])

  const canAdd = (p) => team.length < maxPlayers && !team.find((x) => x.id === p.id) && budgetUsed + (p.role === 'Batsman' ? 7 : p.role === 'Bowler' ? 8 : 9) <= budgetCap

  const joinContest = async () => {
    if (!dbRefs || !user || !contest) return
    if (team.length !== maxPlayers) {
      alert(`Select exactly ${maxPlayers} players to join.`)
      return
    }
    setJoining(true)
    try {
      const userFantasyBase = doc(dbRefs.baseDoc.parent.parent, 'users', user.uid)
      const jplFantasy = doc(collection(userFantasyBase, 'jpl_fantasy')) // auto-id doc container for namespacing
      await setDoc(jplFantasy, { createdAt: serverTimestamp(), lastActionAt: serverTimestamp() })

      // Save team
      const teamsCol = collection(jplFantasy, 'teams')
      const teamDoc = doc(teamsCol, 'team_current')
      await setDoc(teamDoc, {
        name: 'My XI',
        players: team.map((p) => p.id),
        budgetUsed,
        maxPlayers,
        budgetCap,
        createdAt: serverTimestamp(),
      })

      // Register contest join
      const contestsCol = collection(jplFantasy, 'contests')
      await setDoc(doc(contestsCol, contest.id), {
        contestId: contest.id,
        matchId: contest.matchId,
        teamId: 'team_current',
        joinedAt: serverTimestamp(),
      })

      setJoined(true)
    } catch (e) {
      console.error(e)
      alert('Failed to join contest.')
    } finally {
      setJoining(false)
    }
  }

  const myScore = user ? scores?.[user.uid]?.points || 0 : 0

  return (
    <div className="p-4 pb-24">
      <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-slate-300 text-xs">User ID</div>
            <div className="text-white font-mono text-sm break-all">{user?.uid || '—'}</div>
          </div>
          <div className="text-right">
            <div className="text-slate-300 text-xs">Live Score</div>
            <div className="text-amber-400 font-semibold">{myScore} pts</div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-slate-800/60 border border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <div className="text-white font-semibold">Build Your XI</div>
          <div className="text-slate-300 text-sm">{team.length}/{maxPlayers} • {budgetUsed}/{budgetCap} cr</div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {players.slice(0, 20).map((p) => {
            const selected = !!team.find((x) => x.id === p.id)
            return (
              <button
                key={p.id}
                onClick={() => {
                  if (selected) setTeam((t) => t.filter((x) => x.id !== p.id))
                  else if (canAdd(p)) setTeam((t) => [...t, p])
                }}
                className={`text-left rounded-lg border p-3 transition ${
                  selected ? 'bg-emerald-500/20 border-emerald-500/40' : canAdd(p) ? 'bg-slate-900/40 border-slate-700 hover:border-slate-500' : 'bg-slate-900/20 border-slate-800 opacity-60'
                }`}
              >
                <div className="text-white text-sm font-medium truncate">{p.name}</div>
                <div className="text-slate-300 text-xs">{p.role} • cr {(p.role === 'Batsman' ? 7 : p.role === 'Bowler' ? 8 : 9)}</div>
              </button>
            )
          })}
        </div>
        <button
          onClick={joinContest}
          disabled={joining || team.length !== maxPlayers}
          className="mt-4 w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {joining ? 'Joining...' : joined ? 'Joined!' : 'Join Contest'}
        </button>
        <div className="mt-2 text-slate-400 text-xs">Base scoring: 1 run=1, wicket=10, catch=5 • Bonuses: 4=+1, 6=+2, maiden=+5</div>
      </div>

      <div className="mt-4">
        <div className="text-white font-semibold mb-2">Live Leaderboard</div>
        <div className="grid gap-2">
          {Object.entries(scores).length === 0 && (
            <div className="text-slate-400 text-sm">No scores yet. Join the contest and watch this update live.</div>
          )}
          {Object.entries(scores)
            .sort((a, b) => (b[1]?.points || 0) - (a[1]?.points || 0))
            .slice(0, 20)
            .map(([uid, s], i) => (
              <div key={uid} className={`rounded-xl p-3 border ${uid === user?.uid ? 'bg-amber-500/10 border-amber-400/40' : 'bg-slate-800/60 border-slate-700'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 text-sm w-5 text-right">{i + 1}</span>
                    <span className="text-white font-mono text-xs break-all">{uid}</span>
                  </div>
                  <div className="text-amber-400 font-semibold">{s?.points || 0} pts</div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

function TeamsView({ dbRefs }) {
  const [teams, setTeams] = useState([])
  useEffect(() => {
    if (!dbRefs) return
    const unsub = onSnapshot(dbRefs.col('teams'), (snap) => {
      const list = []
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }))
      setTeams(list)
    })
    return () => unsub && unsub()
  }, [dbRefs])
  return (
    <div className="p-4 pb-24 grid gap-3">
      {teams.map((t) => (
        <div key={t.id} className="rounded-xl bg-slate-800/60 border border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <img src={t.logoUrl} alt={t.name} className="w-10 h-10 rounded" />
            <div>
              <div className="text-white font-semibold">{t.name}</div>
              <div className="text-slate-300 text-xs">{t.slogan}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function JPLApp() {
  const fb = useFirebase()
  const dbRefs = useJplRefs(fb.db, fb.appId)
  const [tab, setTab] = useState('home')
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    if (fb.status === 'ready' && fb.db && fb.appId) {
      setSeeding(true)
      seedInitialDataIfNeeded(fb.db, fb.appId, fb.user?.uid)
        .catch((e) => console.error('Seed error:', e))
        .finally(() => setSeeding(false))
    }
  }, [fb.status, fb.db, fb.appId])

  if (fb.status === 'init' || fb.status === 'authing') {
    return (
      <div className="min-h-screen" style={{ backgroundColor: colors.bg }}>
        <div className="flex min-h-screen items-center justify-center">
          <div className="flex items-center gap-2 text-slate-200">
            <Loader2 className="animate-spin" />
            <span>Connecting to JPL...</span>
          </div>
        </div>
      </div>
    )
  }

  if (fb.status === 'error') {
    return (
      <div className="min-h-screen" style={{ backgroundColor: colors.bg }}>
        <div className="max-w-md mx-auto p-6 text-center">
          <div className="text-amber-400 font-semibold text-lg">Setup Error</div>
          <div className="mt-2 text-slate-300 text-sm">{String(fb.error)}</div>
          <div className="mt-4 text-slate-400 text-xs">Ensure window.__app_id and window.__firebase_config are provided.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: colors.bg }}>
      <HomeHero />

      <div className="max-w-md mx-auto -mt-8 relative z-10">
        <div className="rounded-3xl bg-slate-900/70 border border-slate-700 p-4">
          <div className="grid grid-cols-4 text-center text-sm">
            {['home', 'scores', 'fantasy', 'teams'].map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`py-2 rounded-lg ${tab === k ? 'bg-amber-500/10 text-amber-300' : 'text-slate-300'}`}
              >
                {k[0].toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto mt-4">
        {tab === 'home' && (
          <div className="p-4 space-y-4">
            <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-4">
              <div className="text-white font-semibold">Welcome to JPL Season 9</div>
              <div className="text-slate-300 text-sm mt-1">Switch to Scores for live action or build your XI in Fantasy.</div>
            </div>
          </div>
        )}
        {tab === 'scores' && <ScoresView dbRefs={dbRefs} />}
        {tab === 'fantasy' && <FantasyView dbRefs={dbRefs} user={fb.user} />}
        {tab === 'teams' && <TeamsView dbRefs={dbRefs} />}
      </div>

      <BottomNav current={tab} onChange={setTab} />

      {seeding && (
        <div className="fixed bottom-20 left-0 right-0 flex justify-center">
          <div className="px-3 py-1 text-xs rounded-full bg-slate-800/80 border border-slate-700 text-slate-200 flex items-center gap-2">
            <Loader2 className="animate-spin" size={14} />
            Initializing data...
          </div>
        </div>
      )}
    </div>
  )
}
